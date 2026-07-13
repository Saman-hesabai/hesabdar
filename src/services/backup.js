import { supabase } from '../lib/supabase'

const BACKUP_VERSION = 1
const APP_NAME = 'hesabdar'

function chunk(items, size = 300) {
  const result = []
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size))
  }
  return result
}

function cleanText(value) {
  return String(value ?? '').trim()
}

function backupDateName() {
  const now = new Date()
  const pad = value => String(value).padStart(2, '0')

  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate())
  ].join('-') + '-' + [
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds())
  ].join('-')
}

export function makeBackupFilename(storeName = 'store') {
  const safeStore = cleanText(storeName)
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .slice(0, 40) || 'store'

  return `hesabdar-${safeStore}-backup-${backupDateName()}.json`
}

export async function createBackupObject(storeId) {
  if (!storeId) throw new Error('شناسه فروشگاه موجود نیست.')

  const [
    storeResult,
    customersResult,
    transactionsResult,
    staffResult
  ] = await Promise.all([
    supabase
      .from('stores')
      .select('*')
      .eq('id', storeId)
      .maybeSingle(),

    supabase
      .from('customers')
      .select('*')
      .eq('store_id', storeId)
      .order('created_at', { ascending: true }),

    supabase
      .from('transactions')
      .select('*')
      .eq('store_id', storeId)
      .order('created_at', { ascending: true }),

    supabase
      .from('store_users')
      .select('*')
      .eq('store_id', storeId)
      .order('created_at', { ascending: true })
  ])

  if (storeResult.error) throw storeResult.error
  if (customersResult.error) throw customersResult.error
  if (transactionsResult.error) throw transactionsResult.error
  if (staffResult.error) throw staffResult.error

  const store = storeResult.data || { id: storeId, name: 'فروشگاه من' }
  const customers = customersResult.data || []
  const transactions = transactionsResult.data || []
  const staff = staffResult.data || []

  return {
    format: 'hesabdar-backup',
    backup_version: BACKUP_VERSION,
    app: APP_NAME,
    app_version: '0.9',
    created_at: new Date().toISOString(),

    store: {
      id: store.id,
      name: store.name || 'فروشگاه من',
      owner_email: store.owner_email || ''
    },

    summary: {
      customers: customers.length,
      active_customers: customers.filter(item => !item.is_deleted).length,
      transactions: transactions.length,
      active_transactions: transactions.filter(item => !item.is_deleted).length,
      staff: staff.length
    },

    data: {
      customers,
      transactions,
      staff
    }
  }
}

export function backupToFile(backup) {
  const json = JSON.stringify(backup, null, 2)
  const filename = makeBackupFilename(backup?.store?.name)
  return new File([json], filename, {
    type: 'application/json;charset=utf-8'
  })
}


export function downloadBackupFile(backup){
  const file=backupToFile(backup)
  const url=URL.createObjectURL(file)
  const link=document.createElement('a')

  link.href=url
  link.download=file.name
  link.style.display='none'

  document.body.appendChild(link)
  link.click()
  link.remove()

  setTimeout(()=>URL.revokeObjectURL(url),5000)

  return {
    method:'download',
    filename:file.name
  }
}

export async function shareOrDownloadBackup(backup) {
  const file = backupToFile(backup)

  if (
    navigator.share &&
    navigator.canShare &&
    navigator.canShare({ files: [file] })
  ) {
    try {
      await navigator.share({
        title: 'Hesabdar Backup',
        text: `Backup: ${backup?.store?.name || ''}`,
        files: [file]
      })

      return {
        method: 'share',
        filename: file.name
      }
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw error
      }

      console.warn('Share failed, using download fallback:', error)
    }
  }

  const url = URL.createObjectURL(file)
  const link = document.createElement('a')

  link.href = url
  link.download = file.name
  link.style.display = 'none'

  document.body.appendChild(link)
  link.click()
  link.remove()

  setTimeout(() => URL.revokeObjectURL(url), 5000)

  return {
    method: 'download',
    filename: file.name
  }
}

export async function readBackupFile(file) {
  if (!file) throw new Error('فایل بکاپ انتخاب نشده است.')

  const text = await file.text()

  let backup
  try {
    backup = JSON.parse(text)
  } catch {
    throw new Error('فایل انتخاب‌شده JSON معتبر نیست.')
  }

  validateBackup(backup)
  return backup
}

export function validateBackup(backup) {
  if (!backup || typeof backup !== 'object') {
    throw new Error('ساختار فایل بکاپ معتبر نیست.')
  }

  if (backup.format !== 'hesabdar-backup') {
    throw new Error('این فایل مربوط به برنامه حسابدار نیست.')
  }

  if (!backup.data || !Array.isArray(backup.data.customers)) {
    throw new Error('فهرست مشتری‌های فایل بکاپ معتبر نیست.')
  }

  if (!Array.isArray(backup.data.transactions)) {
    throw new Error('فهرست تراکنش‌های فایل بکاپ معتبر نیست.')
  }

  if (!Array.isArray(backup.data.staff)) {
    backup.data.staff = []
  }

  return true
}

export function getBackupPreview(backup) {
  validateBackup(backup)

  return {
    storeName: backup?.store?.name || 'فروشگاه',
    createdAt: backup.created_at || '',
    customers: backup.data.customers.length,
    transactions: backup.data.transactions.length,
    staff: backup.data.staff.length
  }
}

function prepareCustomer(row, currentStoreId) {
  return {
    id: row.id,
    store_id: currentStoreId,
    name: row.name || row.full_name || 'مشتری',
    full_name: row.full_name || row.name || 'مشتری',
    phone: row.phone || '',
    notes: row.notes || '',
    created_by: row.created_by || null,
    created_at: row.created_at || new Date().toISOString(),
    is_deleted: Boolean(row.is_deleted),
    deleted_at: row.deleted_at || null
  }
}

function prepareTransaction(row, currentStoreId) {
  return {
    id: row.id,
    store_id: currentStoreId,
    customer_id: row.customer_id,
    customer_name: row.customer_name || 'مشتری',
    type: row.type === 'payment' ? 'payment' : 'debt',
    amount: Number(row.amount) || 0,
    description: row.description || '',
    created_by: row.created_by || null,
    created_at: row.created_at || new Date().toISOString(),
    is_deleted: Boolean(row.is_deleted),
    deleted_at: row.deleted_at || null
  }
}

function prepareStaff(row, currentStoreId) {
  return {
    store_id: currentStoreId,
    user_email: cleanText(row.user_email).toLowerCase(),
    role: row.role || 'staff',
    active: row.active !== false,
    permissions: row.permissions || {}
  }
}

export async function restoreBackupObject(
  currentStoreId,
  backup,
  { restoreStaff = true } = {}
) {
  if (!currentStoreId) throw new Error('فروشگاه فعلی پیدا نشد.')

  validateBackup(backup)

  const customers = backup.data.customers
    .filter(item => item && item.id)
    .map(item => prepareCustomer(item, currentStoreId))

  const customerIds = new Set(customers.map(item => String(item.id)))

  const transactions = backup.data.transactions
    .filter(item => item && item.id && customerIds.has(String(item.customer_id)))
    .map(item => prepareTransaction(item, currentStoreId))

  const staff = backup.data.staff
    .filter(item => item && cleanText(item.user_email))
    .map(item => prepareStaff(item, currentStoreId))

  for (const group of chunk(customers)) {
    const { error } = await supabase
      .from('customers')
      .upsert(group, { onConflict: 'id' })

    if (error) throw new Error(`خطا در بازیابی مشتری‌ها: ${error.message}`)
  }

  for (const group of chunk(transactions)) {
    const { error } = await supabase
      .from('transactions')
      .upsert(group, { onConflict: 'id' })

    if (error) throw new Error(`خطا در بازیابی تراکنش‌ها: ${error.message}`)
  }

  if (restoreStaff && staff.length) {
    for (const group of chunk(staff)) {
      const { error } = await supabase
        .from('store_users')
        .upsert(group, { onConflict: 'store_id,user_email' })

      if (error) throw new Error(`خطا در بازیابی کارکنان: ${error.message}`)
    }
  }

  if (backup?.store?.name) {
    const { error } = await supabase
      .from('stores')
      .update({ name: backup.store.name })
      .eq('id', currentStoreId)

    if (error) {
      console.warn('Store name restore warning:', error.message)
    }
  }

  return {
    customers: customers.length,
    transactions: transactions.length,
    staff: restoreStaff ? staff.length : 0
  }
}

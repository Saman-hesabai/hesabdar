import { supabase } from '../lib/supabase'

export const DEFAULT_PERMISSIONS={view_customers:true,add_debt:true,add_payment:true,edit_customer:false,delete_customer:false,edit_transaction:false,delete_transaction:false,view_reports:true,use_assistant:true,manage_staff:false}
const normalizeEmail=v=>String(v||'').trim().toLowerCase()
export const customerName=c=>c?.full_name||c?.name||'مشتری'

export async function getSession(){ const {data}=await supabase.auth.getSession(); return data.session }
export async function signIn(email,password){ return supabase.auth.signInWithPassword({email:normalizeEmail(email),password}) }
export async function signUp(email,password){
  return supabase.auth.signUp({
    email:normalizeEmail(email),
    password,
    options:{data:{store_name:'فروشگاه من'}}
  })
}
export async function signOut(){ return supabase.auth.signOut() }

export async function getStore(){
  const {data:{user},error:userError}=await supabase.auth.getUser()
  if(userError) throw userError
  if(!user) return null

  const {data,error}=await supabase.rpc('ensure_my_store')
  if(error) throw new Error('اتصال امن فروشگاه انجام نشد: '+error.message)
  if(!data?.id) throw new Error('فروشگاه اختصاصی این حساب ساخته یا پیدا نشد.')

  const role=data.role||'staff'
  const owner=role==='owner'

  return {
    id:data.id,
    name:data.name||'فروشگاه من',
    owner_email:data.owner_email||'',
    access:{
      role,
      permissions:owner?{
        ...DEFAULT_PERMISSIONS,
        edit_customer:true,
        delete_customer:true,
        edit_transaction:true,
        delete_transaction:true,
        manage_staff:true
      }:{...DEFAULT_PERMISSIONS,...(data.permissions||{})}
    }
  }
}

export async function loadCustomers(storeId,includeDeleted=false){ let q=supabase.from('customers').select('*').eq('store_id',storeId).order('created_at',{ascending:false}); if(!includeDeleted) q=q.eq('is_deleted',false); const {data,error}=await q; if(error) throw error; return data||[] }
export async function loadTransactions(storeId,includeDeleted=false){
  let q=supabase.from('transactions').select('*').eq('store_id',storeId).order('created_at',{ascending:false})
  if(!includeDeleted) q=q.eq('is_deleted',false)
  const {data,error}=await q
  if(error) throw error
  return data||[]
}
export function customerBalance(customerId,transactions){ return transactions.filter(t=>t.customer_id===customerId&&!t.is_deleted).reduce((s,t)=>s+(t.type==='debt'?Number(t.amount):-Number(t.amount)),0) }
export async function addCustomer(storeId,name,phone='',notes=''){ const {data:{user}}=await supabase.auth.getUser(); const payload={store_id:storeId,name,full_name:name,phone,notes,created_by:user?.id,is_deleted:false}; const {data,error}=await supabase.from('customers').insert(payload).select().single(); if(error) throw error; return data }
export async function updateCustomer(id,{name,phone,notes}){ const {data,error}=await supabase.from('customers').update({full_name:name,phone,notes}).eq('id',id).select().single(); if(error) throw error; return data }
export async function addTransaction(storeId,customerId,type,amount,description=''){ const {data:{user}}=await supabase.auth.getUser(); const {data:c,error:ce}=await supabase.from('customers').select('*').eq('id',customerId).eq('store_id',storeId).single(); if(ce) throw ce; const {data,error}=await supabase.from('transactions').insert({store_id:storeId,customer_id:customerId,customer_name:customerName(c),type,amount,description,created_by:user?.id,is_deleted:false}).select().single(); if(error) throw error; return data }
export async function updateTransaction(id,{type,amount,description}){ const payload={type,amount:Number(amount),description:String(description||'')}; const {data,error}=await supabase.from('transactions').update(payload).eq('id',id).select('*').maybeSingle(); if(error) throw error; if(!data) throw new Error('تراکنش پیدا نشد یا اجازه ویرایش آن را ندارید.'); return data }
export async function softDeleteTransaction(id){ const {error}=await supabase.from('transactions').update({is_deleted:true,deleted_at:new Date().toISOString()}).eq('id',id); if(error) throw error }
export async function restoreTransaction(id){ const {error}=await supabase.from('transactions').update({is_deleted:false,deleted_at:null}).eq('id',id); if(error) throw error }
export async function hardDeleteTransaction(id){ const {error}=await supabase.from('transactions').delete().eq('id',id); if(error) throw error }
export async function softDeleteCustomer(id){ const {error}=await supabase.from('customers').update({is_deleted:true,deleted_at:new Date().toISOString()}).eq('id',id); if(error) throw error }
export async function restoreCustomer(id){ const {error}=await supabase.from('customers').update({is_deleted:false,deleted_at:null}).eq('id',id); if(error) throw error }
export async function hardDeleteCustomer(id){ const {error}=await supabase.from('customers').delete().eq('id',id); if(error) throw error }

export async function loadStaff(storeId){ const {data,error}=await supabase.from('store_users').select('*').eq('store_id',storeId).order('created_at',{ascending:false}); if(error) throw error; return data||[] }
export async function saveStaff(storeId,{email,role='staff',active=true,permissions={}}){ const payload={store_id:storeId,user_email:normalizeEmail(email),role,active,permissions}; const {data,error}=await supabase.from('store_users').upsert(payload,{onConflict:'store_id,user_email'}).select().single(); if(error) throw error; return data }
export async function removeStaff(id){ const {error}=await supabase.from('store_users').delete().eq('id',id); if(error) throw error }

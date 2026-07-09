import { supabase } from '../lib/supabase'

export async function getSession(){ const {data}=await supabase.auth.getSession(); return data.session }
export async function signIn(email,password){ return supabase.auth.signInWithPassword({email,password}) }
export async function signUp(email,password){ return supabase.auth.signUp({email,password}) }
export async function signOut(){ return supabase.auth.signOut() }
export async function getStore(){
  const {data:{user}}=await supabase.auth.getUser(); if(!user) return null
  let {data:stores,error}=await supabase.from('stores').select('*').eq('owner_id',user.id).limit(1)
  if(error) throw error
  if(stores?.[0]) return stores[0]
  const {data:member}=await supabase.from('store_members').select('store_id, stores(*)').eq('user_id',user.id).limit(1)
  return member?.[0]?.stores || null
}
export async function loadCustomers(storeId, includeDeleted=false){
  let q=supabase.from('customers').select('*').eq('store_id',storeId).order('created_at',{ascending:false})
  if(!includeDeleted) q=q.eq('is_deleted',false)
  const {data,error}=await q; if(error) throw error; return data||[]
}
export async function loadTransactions(storeId){
  const {data,error}=await supabase.from('transactions').select('*').eq('store_id',storeId).eq('is_deleted',false).order('created_at',{ascending:false})
  if(error) throw error; return data||[]
}
export function customerBalance(customerId, transactions){
  return transactions.filter(t=>t.customer_id===customerId && !t.is_deleted).reduce((sum,t)=>sum+(t.type==='debt'?Number(t.amount):-Number(t.amount)),0)
}
export async function addCustomer(storeId, full_name, phone='', notes=''){
  const {data:{user}}=await supabase.auth.getUser()
  const {data,error}=await supabase.from('customers').insert({store_id:storeId,full_name,phone,notes,created_by:user?.id}).select().single()
  if(error) throw error; return data
}
export async function addTransaction(storeId, customerId, type, amount, description=''){
  const {data:{user}}=await supabase.auth.getUser()
  const {data,error}=await supabase.from('transactions').insert({store_id:storeId,customer_id:customerId,type,amount,description,created_by:user?.id}).select().single()
  if(error) throw error; return data
}
export async function softDeleteCustomer(id){ const {error}=await supabase.from('customers').update({is_deleted:true,deleted_at:new Date().toISOString()}).eq('id',id); if(error) throw error }
export async function restoreCustomer(id){ const {error}=await supabase.from('customers').update({is_deleted:false,deleted_at:null}).eq('id',id); if(error) throw error }
export async function hardDeleteCustomer(id){ const {error}=await supabase.from('customers').delete().eq('id',id); if(error) throw error }

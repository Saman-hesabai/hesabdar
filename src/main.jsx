import React, {useEffect, useMemo, useState} from 'react'
import { createRoot } from 'react-dom/client'
import { LogOut, RefreshCw, Users, Wallet, BarChart3, Bot, Settings, ChevronDown, Plus, Trash2, RotateCcw, Search, Mic, Send, X } from 'lucide-react'
import './styles/app.css'
import { supabase } from './lib/supabase'
import { addCustomer, addTransaction, customerBalance, getSession, getStore, hardDeleteCustomer, loadCustomers, loadTransactions, restoreCustomer, signIn, signOut, signUp, softDeleteCustomer } from './services/api'
import { formatMoney, parseAmountFromText, safeCalc } from './utils/money'

function Auth({onAuth}){
  const [mode,setMode]=useState('login'), [email,setEmail]=useState(''), [password,setPassword]=useState(''), [msg,setMsg]=useState('')
  async function submit(e){ e.preventDefault(); setMsg('')
    const res= mode==='login'? await signIn(email,password): await signUp(email,password)
    if(res.error) setMsg(res.error.message); else { setMsg(mode==='login'?'وارد شدی':'ثبت‌نام انجام شد؛ اگر ایمیل تایید خواست، ایمیلت را چک کن'); onAuth?.() }
  }
  return <main className="auth"><section className="auth-card"><h1>حسابدار</h1><p>مدیریت نسیه و پرداخت فروشگاهی</p><form onSubmit={submit}><input placeholder="ایمیل" value={email} onChange={e=>setEmail(e.target.value)} /><input placeholder="رمز" type="password" value={password} onChange={e=>setPassword(e.target.value)} /><button>{mode==='login'?'ورود':'ثبت‌نام'}</button></form><button className="link" onClick={()=>setMode(mode==='login'?'signup':'login')}>{mode==='login'?'حساب ندارم؛ ثبت‌نام':'حساب دارم؛ ورود'}</button>{msg&&<div className="toast-msg">{msg}</div>}</section></main>
}

function Glass({title,sub,icon:Icon,open,onToggle,children}){ return <section className={'glass '+(open?'open':'')}><button className="glass-head" onClick={onToggle}><span className="icon"><Icon size={28}/></span><span><b>{title}</b><small>{sub}</small></span><ChevronDown className={open?'rot':''}/></button>{open&&<div className="glass-body">{children}</div>}</section> }

function Assistant({customers,transactions,storeId,onDone}){
  const [text,setText]=useState(''), [answer,setAnswer]=useState('سلام سامان 👋 امروز چه کاری انجام بدم؟')
  async function run(){ const q=text.trim(); if(!q) return; setText('')
    const lower=q.replace(/ي/g,'ی').replace(/ك/g,'ک')
    const amount=parseAmountFromText(lower)
    const found=customers.find(c=> lower.includes(c.full_name.split(' ')[0]) || lower.includes(c.full_name))
    try{
      if(/بدهکارترین|بیشترین بده/.test(lower)){ const sorted=customers.map(c=>({c,b:customerBalance(c.id,transactions)})).sort((a,b)=>b.b-a.b); setAnswer(sorted[0]?`بدهکارترین مشتری ${sorted[0].c.full_name} با ${formatMoney(sorted[0].b)} است.`:'مشتری بدهکار نداریم.'); return }
      if(/چقدر|مانده|بدهی/.test(lower) && found){ setAnswer(`مانده حساب ${found.full_name}: ${formatMoney(customerBalance(found.id,transactions))}`); return }
      if(/مشتری جدید|ثبت مشتری|اضافه کن/.test(lower)){ const name=lower.replace(/حسابدار|مشتری جدید|ثبت مشتری|اضافه کن|به اسم|اسم/g,'').trim(); if(!name){setAnswer('اسم مشتری رو بگو تا ثبت کنم.');return} await addCustomer(storeId,name); setAnswer(`مشتری ${name} ثبت شد.`); onDone(); return }
      if((/پرداخت|کم کن|واریز|گرفت/.test(lower)) && found && amount>0){ await addTransaction(storeId,found.id,'payment',amount,'ثبت با دستیار: '+q); setAnswer(`${formatMoney(amount)} پرداخت برای ${found.full_name} ثبت شد.`); onDone(); return }
      if((/نسیه|بدهی|ثبت کن|بنویس/.test(lower)) && found && amount>0){ const desc=lower.replace(/حسابدار|برای|نسیه|بدهی|ثبت کن|بنویس/g,'').replace(found.full_name,'').replace(found.full_name.split(' ')[0],'').trim(); await addTransaction(storeId,found.id,'debt',amount,desc||'ثبت با دستیار'); setAnswer(`${formatMoney(amount)} نسیه برای ${found.full_name} ثبت شد.`); onDone(); return }
      setAnswer('دستور رو نفهمیدم. مثلا بنویس: حسابدار برای اکبر ۳۵۰ هزار روغن ثبت کن')
    }catch(e){ setAnswer('خطا: '+e.message) }
  }
  return <div className="assistant"><div className="bubble bot">{answer}</div><div className="assistant-row"><input value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>e.key==='Enter'&&run()} placeholder="مثلا: حسابدار برای اکبر ۳۵۰ هزار روغن ثبت کن"/><button onClick={run}><Send size={19}/></button><button className="mic" onClick={()=>setAnswer('فرمان صوتی در نسخه بعدی فعال می‌شود؛ فعلاً متن بنویس.')}><Mic size={19}/></button></div></div>
}

function App(){
  const [session,setSession]=useState(null), [store,setStore]=useState(null), [customers,setCustomers]=useState([]), [deleted,setDeleted]=useState([]), [transactions,setTransactions]=useState([]), [open,setOpen]=useState('quick'), [q,setQ]=useState('')
  const [name,setName]=useState(''), [phone,setPhone]=useState(''), [selected,setSelected]=useState(''), [type,setType]=useState('debt'), [amountText,setAmountText]=useState(''), [desc,setDesc]=useState(''), [msg,setMsg]=useState('')
  const amount=safeCalc(amountText)
  const activeCustomers=useMemo(()=>customers.filter(c=>(c.full_name+' '+(c.phone||'')).includes(q)),[customers,q])
  const total=useMemo(()=>customers.reduce((s,c)=>s+customerBalance(c.id,transactions),0),[customers,transactions])
  async function boot(){ try{ const s=await getSession(); setSession(s); if(s){ const st=await getStore(); setStore(st); if(st){ const cs=await loadCustomers(st.id,false); const ds=await loadCustomers(st.id,true); const tr=await loadTransactions(st.id); setCustomers(cs); setDeleted(ds.filter(x=>x.is_deleted)); setTransactions(tr); } } }catch(e){ setMsg(e.message) } }
  useEffect(()=>{boot(); const {data}=supabase.auth.onAuthStateChange(()=>boot()); return ()=>data.subscription.unsubscribe()},[])
  async function createCustomer(e){ e.preventDefault(); if(!name.trim())return; try{await addCustomer(store.id,name,phone); setName(''); setPhone(''); setMsg('مشتری ثبت شد'); boot()}catch(e){setMsg(e.message)} }
  async function createTransaction(e){ e.preventDefault(); if(!selected||!amount)return setMsg('مشتری و مبلغ را وارد کن'); try{await addTransaction(store.id,selected,type,amount,desc); setAmountText(''); setDesc(''); setMsg(type==='debt'?'نسیه ثبت شد':'پرداخت ثبت شد'); boot()}catch(e){setMsg(e.message)} }
  async function remove(c){ if(!confirm(`مشتری ${c.full_name} به سطل زباله منتقل شود؟`))return; try{await softDeleteCustomer(c.id); setMsg('مشتری به سطل زباله رفت'); boot()}catch(e){setMsg(e.message)} }
  if(!session) return <Auth onAuth={boot}/>
  return <main className="app"><header className="top"><div><h1>حسابدار</h1><p>{store?.name||'فروشگاه من'}</p></div><button className="exit" onClick={async()=>{await signOut();setSession(null)}}><LogOut/> خروج</button></header><section className="hero"><h2>سلام سامان 👋</h2><p>داشبورد فشرده، شیشه‌ای و آماده دستیار هوشمند</p><button onClick={boot}><RefreshCw/> بروزرسانی</button></section>{msg&&<div className="snack"><span>{msg}</span><button onClick={()=>setMsg('')}><X size={18}/></button></div>}<section className="stats"><div><Wallet/><span>مانده کل</span><b>{formatMoney(total)}</b></div><div><Users/><span>مشتری‌ها</span><b>{customers.length}</b></div><div><BarChart3/><span>بدهکارها</span><b>{customers.filter(c=>customerBalance(c.id,transactions)>0).length}</b></div></section>
  <Glass title="عملیات سریع" sub="ثبت مشتری، نسیه و پرداخت" icon={Plus} open={open==='quick'} onToggle={()=>setOpen(open==='quick'?'':'quick')}><form onSubmit={createCustomer} className="grid"><h3>ثبت مشتری جدید</h3><input value={name} onChange={e=>setName(e.target.value)} placeholder="نام مشتری"/><input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="شماره موبایل اختیاری"/><button>ثبت مشتری</button></form><form onSubmit={createTransaction} className="grid"><h3>ثبت تراکنش</h3><div className="toggle"><button type="button" className={type==='debt'?'on':''} onClick={()=>setType('debt')}>نسیه</button><button type="button" className={type==='payment'?'on':''} onClick={()=>setType('payment')}>پرداخت</button></div><select value={selected} onChange={e=>setSelected(e.target.value)}><option value="">انتخاب مشتری</option>{customers.map(c=><option key={c.id} value={c.id}>{c.full_name}</option>)}</select><input value={amountText} onChange={e=>setAmountText(e.target.value)} placeholder="مثلا 80000+150000"/><div className="calc">مبلغ محاسبه‌شده: {formatMoney(amount)}</div><input value={desc} onChange={e=>setDesc(e.target.value)} placeholder="توضیح؛ مثلا روغن و برنج"/><button>{type==='debt'?'ثبت نسیه':'ثبت پرداخت'}</button></form></Glass>
  <Glass title="مشتری‌ها" sub="جستجو، جزئیات و سطل زباله" icon={Users} open={open==='customers'} onToggle={()=>setOpen(open==='customers'?'':'customers')}><div className="search"><Search/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="جستجوی نام یا موبایل"/></div><div className="list">{activeCustomers.map(c=><div className="row" key={c.id}><span><b>{c.full_name}</b><small>{c.phone||'بدون موبایل'} | {formatMoney(customerBalance(c.id,transactions))}</small></span><button className="danger" onClick={()=>remove(c)}><Trash2/></button></div>)}</div>{deleted.length>0&&<div className="trash"><h3>سطل زباله</h3>{deleted.map(c=><div className="row" key={c.id}><span>{c.full_name}</span><button onClick={async()=>{await restoreCustomer(c.id);boot()}}><RotateCcw/> بازگردانی</button><button className="danger" onClick={async()=>{ if(prompt('برای حذف دائمی بنویس: حذف')==='حذف'){await hardDeleteCustomer(c.id);boot()} }}>حذف دائمی</button></div>)}</div>}</Glass>
  <Glass title="گزارش‌ها" sub="خلاصه وضعیت و بدهی‌ها" icon={BarChart3} open={open==='reports'} onToggle={()=>setOpen(open==='reports'?'':'reports')}><div className="report"><p>مانده کل: <b>{formatMoney(total)}</b></p><p>آخرین تراکنش‌ها: {transactions.length}</p><p>بدهکارترین: {customers.map(c=>({c,b:customerBalance(c.id,transactions)})).sort((a,b)=>b.b-a.b)[0]?.c.full_name||'ندارد'}</p></div></Glass>
  <Glass title="دستیار حسابدار" sub="فرمان متنی، آماده توسعه صوتی" icon={Bot} open={open==='ai'} onToggle={()=>setOpen(open==='ai'?'':'ai')}><Assistant customers={customers} transactions={transactions} storeId={store?.id} onDone={boot}/></Glass>
  <Glass title="مدیریت و پشتیبانی" sub="درباره، پشتیبانی و تنظیمات آینده" icon={Settings} open={open==='settings'} onToggle={()=>setOpen(open==='settings'?'':'settings')}><div className="about"><h3>درباره و پشتیبانی</h3><p>سازنده: سامان رفیعی</p><p>تماس: 09397185205</p><p>نسخه: v0.4 Smart</p></div></Glass>
  </main>
}
createRoot(document.getElementById('root')).render(<App />)

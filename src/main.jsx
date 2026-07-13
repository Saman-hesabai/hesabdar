import React,{useEffect,useMemo,useState} from 'react'
import {createRoot} from 'react-dom/client'
import {LogOut,RefreshCw,Users,Wallet,BarChart3,Bot,Settings,ChevronDown,Plus,Trash2,RotateCcw,Search,Mic,Send,X,Home,Sparkles,MessageCircle,Edit3,UserCog,Save,ShieldCheck,CheckCircle2,Menu,Moon,Sun,SlidersHorizontal,Info,ArrowRight,Calculator,Check,AlertTriangle,FileText,Share2} from 'lucide-react'
import './styles/app.css'
import {supabase} from './lib/supabase'
import {DEFAULT_PERMISSIONS,addCustomer,addTransaction,customerBalance,customerName,getSession,getStore,hardDeleteCustomer,loadCustomers,loadStaff,loadTransactions,removeStaff,restoreCustomer,saveStaff,signIn,signOut,signUp,softDeleteCustomer,softDeleteTransaction,restoreTransaction,hardDeleteTransaction,updateCustomer,updateTransaction} from './services/api'
import {formatMoney,parseAmountFromText,safeCalc,toEnglishDigits,formatAmountInput,amountToWords} from './utils/money'
import BackupManager from './components/BackupManager'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'

const normalize=v=>String(v||'').replace(/ي/g,'ی').replace(/ك/g,'ک').replace(/[ۀة]/g,'ه').replace(/\s+/g,' ').trim()
const esc=v=>v.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')
function speak(text){try{speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.lang='fa-IR';u.rate=.95;speechSynthesis.speak(u)}catch{}}
function Auth({onAuth}){const[mode,setMode]=useState('login'),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[msg,setMsg]=useState('');async function submit(e){e.preventDefault();const r=mode==='login'?await signIn(email,password):await signUp(email,password);if(r.error)setMsg(r.error.message);else{setMsg('انجام شد');onAuth?.()}}return <main className="auth"><section className="auth-card"><h1>حسابدار</h1><p>مدیریت نسیه و پرداخت فروشگاهی</p><form onSubmit={submit}><input placeholder="ایمیل" value={email} onChange={e=>setEmail(e.target.value)}/><input placeholder="رمز" type="password" value={password} onChange={e=>setPassword(e.target.value)}/><button>{mode==='login'?'ورود':'ثبت‌نام'}</button></form><button className="link" onClick={()=>setMode(mode==='login'?'signup':'login')}>{mode==='login'?'حساب ندارم؛ ثبت‌نام':'حساب دارم؛ ورود'}</button>{msg&&<div className="toast-msg">{msg}</div>}</section></main>}
function Glass({title,sub,icon:Icon,open,onToggle,children,sectionKey}){return <section data-section={sectionKey||undefined} className={'glass '+(open?'open':'')}><button className="glass-head" onClick={onToggle}><span className="icon"><Icon size={28}/></span><span><b>{title}</b><small>{sub}</small></span><ChevronDown className={open?'rot':''}/></button>{open&&<div className="glass-body">{children}</div>}</section>}

function parsePersianNumberWords(input=''){
  const units={صفر:0,یک:1,يك:1,یه:1,دو:2,سه:3,چهار:4,پنج:5,شش:6,هفت:7,هشت:8,نه:9,ده:10,یازده:11,دوازده:12,سیزده:13,چهارده:14,پانزده:15,شانزده:16,هفده:17,هجده:18,نوزده:19}
  const tens={بیست:20,سی:30,چهل:40,پنجاه:50,شصت:60,هفتاد:70,هشتاد:80,نود:90}
  const hundreds={صد:100,یکصد:100,دویست:200,سیصد:300,چهارصد:400,پانصد:500,ششصد:600,هفتصد:700,هشتصد:800,نهصد:900}
  const tokens=normalize(input).replace(/ و /g,' ').split(' ').filter(Boolean)
  let total=0,current=0,found=false
  for(const token of tokens){
    if(token in units){current+=units[token];found=true;continue}
    if(token in tens){current+=tens[token];found=true;continue}
    if(token in hundreds){current+=hundreds[token];found=true;continue}
    if(token==='هزار'){total+=(current||1)*1000;current=0;found=true;continue}
    if(token==='میلیون'||token==='ملیون'){total+=(current||1)*1000000;current=0;found=true;continue}
  }
  return found?total+current:0
}

function levenshtein(a='',b=''){
  const x=String(a),y=String(b)
  const row=Array.from({length:y.length+1},(_,i)=>i)
  for(let i=1;i<=x.length;i++){
    let prev=row[0]
    row[0]=i
    for(let j=1;j<=y.length;j++){
      const old=row[j]
      row[j]=Math.min(row[j]+1,row[j-1]+1,prev+(x[i-1]===y[j-1]?0:1))
      prev=old
    }
  }
  return row[y.length]
}

function voiceNormalize(value=''){
  return normalize(toEnglishDigits(value))
    .replace(/[َُِّْٰٓٔ]/g,'')
    .replace(/[أإٱ]/g,'ا')
    .replace(/ؤ/g,'و')
    .replace(/ئ/g,'ی')
    .replace(/‌/g,' ')
    .replace(/[،,:؛.!?؟()\[\]{}]/g,' ')
    .replace(/\s+/g,' ')
    .trim()
}

function customerMatchScore(spokenName,customer){
  const spoken=voiceNormalize(spokenName)
  const full=voiceNormalize(customerName(customer))
  if(!spoken||!full)return 0
  if(spoken===full)return 1
  if((' '+spoken+' ').includes(' '+full+' '))return .98
  const st=spoken.split(' ').filter(Boolean)
  const ft=full.split(' ').filter(Boolean)
  const overlap=ft.filter(token=>st.some(x=>x===token||levenshtein(x,token)<=1)).length/Math.max(1,ft.length)
  const compactA=spoken.replace(/\s/g,'')
  const compactB=full.replace(/\s/g,'')
  const edit=1-levenshtein(compactA,compactB)/Math.max(compactA.length,compactB.length,1)
  const prefix=ft.some(token=>st.some(x=>x.startsWith(token.slice(0,Math.min(4,token.length)))||token.startsWith(x.slice(0,Math.min(4,x.length)))))?.08:0
  return Math.min(1,overlap*.62+edit*.30+prefix)
}

function parseVoice(q,customers){
  const original=voiceNormalize(q)
  const text=original
    .replace(/[٬,]/g,'')
    .replace(/تومن/g,'تومان')
    .replace(/ملیون/g,'میلیون')
    .replace(/هزارتومن/g,'هزار تومان')
    .replace(/\s+/g,' ')
    .trim()

  const amount=parseAmountFromText(text)||parsePersianNumberWords(text)
  const paymentPatterns=['کم کن','کسر کن','از حساب کم','از حسابش کم','پرداخت','تسویه','واریز','پول داد','دریافت کردم','صاف کرد']
  const debtPatterns=['اضافه کن','به حساب اضافه','بدهی','نسیه','روی حساب','برد','خرید کرد','خرید','ثبت کن','بنویس','زیاد کن']
  let type=null
  if(paymentPatterns.some(word=>text.includes(word)))type='payment'
  else if(debtPatterns.some(word=>text.includes(word)))type='debt'

  const numberWords='صفر|یک|يك|یه|دو|سه|چهار|پنج|شش|هفت|هشت|نه|ده|یازده|دوازده|سیزده|چهارده|پانزده|شانزده|هفده|هجده|نوزده|بیست|سی|چهل|پنجاه|شصت|هفتاد|هشتاد|نود|صد|یکصد|دویست|سیصد|چهارصد|پانصد|ششصد|هفتصد|هشتصد|نهصد|هزار|میلیون'
  let nameText=(' '+text+' ')
    .replace(new RegExp('\\b(?:'+numberWords+')\\b','g'),' ')
    .replace(/[0-9]+(?:\.[0-9]+)?/g,' ')
    .replace(/تومان|تومن|ریال|حسابدار|نسیه|بدهی|پرداخت|تسویه|ثبت|کن|کرد|کرده|برای|به|از|حساب|اضافه|کم|روی|خرید|برد|واریز|پول|داد|دریافت|من|رو|را/g,' ')
    .replace(/\s+/g,' ').trim()

  const ranked=customers.map(customer=>({customer,score:customerMatchScore(nameText,customer)})).sort((a,b)=>b.score-a.score)
  const topScore=ranked[0]?.score||0
  const candidates=ranked.filter(item=>item.score>=Math.max(.28,topScore-.20)).slice(0,5).map(item=>item.customer)
  const confident=topScore>=.72&&topScore-(ranked[1]?.score||0)>=.10

  let description=text
  candidates.forEach(customer=>{description=description.replace(new RegExp(esc(voiceNormalize(customerName(customer))),'g'),' ')})
  description=description
    .replace(/[0-9]+(?:\.\d+)?\s*(?:هزار|میلیون)?\s*(?:تومان|تومن|ریال)?/g,' ')
    .replace(new RegExp(numberWords,'g'),' ')
    .replace(/حسابدار|نسیه|بدهی|پرداخت|تسویه|ثبت کن|اضافه کن|کم کن|برای|به حساب|از حساب|تومان|تومن|ریال/g,' ')
    .replace(/\s+/g,' ').trim()

  return {amount,type,description,original,candidates,confident,nameText,topScore}
}
function CustomerPicker({customers,value,onChange,placeholder='جست‌وجوی مشتری'}){
  const[open,setOpen]=useState(false)
  const[query,setQuery]=useState('')
  const selected=customers.find(customer=>customer.id===value)
  const filtered=customers.filter(customer=>
    normalize(customerName(customer)+' '+(customer.phone||''))
      .includes(normalize(query))
  )

  return <div className="customer-picker">
    <button type="button" className="customer-picker-trigger" onClick={()=>setOpen(true)}>
      <Search size={18}/>
      <span>{selected?customerName(selected):'انتخاب مشتری'}</span>
      <ChevronDown size={18}/>
    </button>
    {open&&<div className="picker-backdrop" onMouseDown={event=>event.target===event.currentTarget&&setOpen(false)}>
      <section className="picker-card">
        <div className="modal-head">
          <div><h3>انتخاب مشتری</h3><small>نام یا شماره موبایل را جست‌وجو کن</small></div>
          <button type="button" className="mini-action" onClick={()=>setOpen(false)}><X/></button>
        </div>
        <div className="search picker-search"><Search/><input autoFocus value={query} onChange={event=>setQuery(event.target.value)} placeholder={placeholder}/></div>
        <div className="picker-list">
          {filtered.length===0&&<p className="empty-state">مشتری پیدا نشد.</p>}
          {filtered.map(customer=><button type="button" key={customer.id} onClick={()=>{onChange(customer.id);setOpen(false);setQuery('')}}>
            <span><b>{customerName(customer)}</b><small>{customer.phone||'بدون شماره'}</small></span>
            {customer.id===value&&<Check size={18}/>} 
          </button>)}
        </div>
      </section>
    </div>}
  </div>
}

function MiniCalculator({onApply}){
  const[open,setOpen]=useState(false)
  const[expression,setExpression]=useState('')
  const result=safeCalc(expression)

  function append(value){
    setExpression(current=>current+value)
  }

  function clearEntry(){
    setExpression(current=>current.replace(/(?:\d+(?:\.\d*)?|[+\-*/])$/,''))
  }

  function squareRoot(){
    const value=result||Number(expression)
    if(value>=0&&Number.isFinite(value))setExpression(String(Math.sqrt(value)))
  }

  function percent(){
    const value=result||Number(expression)
    if(Number.isFinite(value))setExpression(String(value/100))
  }

  function recallTotal(){
    if(result)append(String(result))
  }

  function applyAmount(){
    if(!(result>0))return
    onApply(result)
    setExpression('')
    setOpen(false)
  }

  const key=(label,action,className='')=><button type="button" className={className} onClick={action}>{label}</button>

  return <div className="mini-calculator">
    <button type="button" className="calculator-toggle" onClick={()=>setOpen(!open)}><Calculator size={18}/> ماشین‌حساب</button>
    {open&&<div className="calculator-panel shop-calculator">
      <div className="shop-calc-screen">
        <input className="calculator-display" inputMode="none" value={expression} readOnly placeholder="مثلاً 15000+43000+25000"/>
        <div className="calculator-result">نتیجه: <b>{formatMoney(result)}</b></div>
      </div>
      <div className="shop-calc-keys">
        {key('GT',recallTotal,'k-gt')}
        {key('√',squareRoot,'k-sqrt')}
        {key('۷',()=>append('7'),'k-7 num')}
        {key('۸',()=>append('8'),'k-8 num')}
        {key('۹',()=>append('9'),'k-9 num')}
        {key('×',()=>append('*'),'k-mul op danger-op')}
        {key('MU',()=>{},'k-mu muted-key')}

        {key('CE',clearEntry,'k-ce')}
        {key('%',percent,'k-percent')}
        {key('۴',()=>append('4'),'k-4 num')}
        {key('۵',()=>append('5'),'k-5 num')}
        {key('۶',()=>append('6'),'k-6 num')}
        {key('÷',()=>append('/'),'k-div op')}
        {key('⌫',()=>setExpression(current=>current.slice(0,-1)),'k-back')}

        {key('CA',()=>setExpression(''),'k-ca danger-key')}
        {key('۱',()=>append('1'),'k-1 num')}
        {key('۲',()=>append('2'),'k-2 num')}
        {key('۳',()=>append('3'),'k-3 num')}
        {key('−',()=>append('-'),'k-sub op')}

        {key('۰',()=>append('0'),'k-0 num')}
        {key('۰۰',()=>append('00'),'k-00 num')}
        {key('۰۰۰',()=>append('000'),'k-000 num')}
        {key('.',()=>append('.'),'k-dot num')}
        {key('+',()=>append('+'),'k-plus op plus-key')}
        {key('=',()=>result&&setExpression(String(result)),'k-equals op equals-key')}
      </div>
      <button type="button" className="calc-apply shop-apply" disabled={!result} onClick={applyAmount}>ثبت مبلغ {result?`(${formatMoney(result)})`:''}</button>
    </div>}
  </div>
}
function Assistant({customers,transactions,storeId,onDone,onClose,canUse,notify}){
  const[text,setText]=useState('')
  const[answer,setAnswer]=useState('سلام سامان 👋 فرمانت را بگو.')
  const[listening,setListening]=useState(false)
  const[busy,setBusy]=useState(false)
  const[pending,setPending]=useState(null)
  const[selectedCandidate,setSelectedCandidate]=useState('')

  async function run(input=text){
    if(!canUse){
      setAnswer('دسترسی دستیار برای این کاربر فعال نیست.')
      return
    }

    const q=String(input||'').trim()

    if(!q)return

    if(!storeId){
      setAnswer('فروشگاه هنوز متصل نشده است.')
      return
    }

    setText('')
    setBusy(true)
    setPending(null)
    setSelectedCandidate('')
    setAnswer('در حال تحلیل هوشمند فرمان...')

    function rankCustomers(spokenName=''){
      const name=voiceNormalize(spokenName)

      return customers
        .map(customer=>({
          customer,
          score:customerMatchScore(name,customer)
        }))
        .sort((a,b)=>b.score-a.score)
    }

    function prepareTransaction(result){
      const amount=Number(result?.amount||0)
      const type=result?.type
      const requestedName=String(result?.customer_name||'').trim()

      if(!(amount>0)){
        throw new Error('هوش مصنوعی مبلغ را تشخیص نداد.')
      }

      if(type!=='debt'&&type!=='payment'){
        throw new Error('مشخص نشد عملیات طلب است یا پرداخت.')
      }

      if(!requestedName){
        throw new Error('نام مشتری تشخیص داده نشد.')
      }

      const ranked=rankCustomers(requestedName)
      const topScore=ranked[0]?.score||0

      const candidates=ranked
        .filter(item=>item.score>=Math.max(.28,topScore-.22))
        .slice(0,5)
        .map(item=>item.customer)

      if(candidates.length===0){
        throw new Error(`مشتری «${requestedName}» در فهرست پیدا نشد.`)
      }

      const secondScore=ranked[1]?.score||0
      const confident=
        topScore>=.70 &&
        topScore-secondScore>=.08

      const selectedId=
        confident
          ? candidates[0]?.id||''
          : ''

      const pendingData={
        action:'add_transaction',
        type,
        amount,
        description:String(result?.description||'').trim(),
        customer_name:requestedName,
        candidates,
        confident,
        confidence:Number(result?.confidence||0),
        needs_confirmation:result?.needs_confirmation!==false
      }

      setSelectedCandidate(selectedId)
      setPending(pendingData)

      const typeLabel=type==='debt'?'طلب':'پرداخت'
      const customerLabel=
        selectedId
          ? customerName(candidates[0])
          : requestedName

      const descriptionText=pendingData.description
        ? ` بابت ${pendingData.description}`
        : ''

      const response=
        `${formatMoney(amount)} تومان ${typeLabel} برای ${customerLabel}${descriptionText} تشخیص داده شد؛ تأیید کن.`

      setAnswer(response)
      speak(response)
    }

    try{
      const aiCustomers=customers.map(customer=>({
        id:customer.id,
        name:customerName(customer),
        phone:customer.phone||''
      }))

      const {data,error}=await supabase.functions.invoke(
        'hesabdar-ai',
        {
          body:{
            text:q,
            customers:aiCustomers
          }
        }
      )

      if(error){
        let message=error.message||'ارتباط با دستیار هوشمند انجام نشد.'

        try{
          if(error.context){
            const details=await error.context.json()
            message=details?.error||message
          }
        }catch{}

        throw new Error(message)
      }

      if(!data?.ok){
        throw new Error(
          data?.error||
          'پاسخ معتبر از دستیار هوشمند دریافت نشد.'
        )
      }

      const result=data.result||{}
      const action=result.action||'unknown'

      if(action==='add_transaction'){
        prepareTransaction(result)
        return
      }

      if(action==='today_report'){
        const today=new Date().toISOString().slice(0,10)

        const items=transactions.filter(item=>
          String(item.created_at||'').slice(0,10)===today &&
          !item.is_deleted
        )

        const debt=items
          .filter(item=>item.type==='debt')
          .reduce((sum,item)=>sum+Number(item.amount||0),0)

        const payment=items
          .filter(item=>item.type==='payment')
          .reduce((sum,item)=>sum+Number(item.amount||0),0)

        const response=
          `امروز ${formatMoney(debt)} تومان طلب و ${formatMoney(payment)} تومان پرداخت ثبت شده است.`

        setAnswer(response)
        speak(response)
        return
      }

      if(action==='highest_debtor'){
        const balances=customers
          .map(customer=>({
            customer,
            balance:customerBalance(customer.id,transactions)
          }))
          .sort((a,b)=>b.balance-a.balance)

        const highest=balances[0]

        const response=
          highest&&highest.balance>0
            ? `بدهکارترین مشتری ${customerName(highest.customer)} با مانده ${formatMoney(highest.balance)} تومان است.`
            : 'در حال حاضر مشتری بدهکاری پیدا نشد.'

        setAnswer(response)
        speak(response)
        return
      }

      if(action==='get_balance'){
        const ranked=rankCustomers(result.customer_name)
        const customer=ranked[0]?.customer

        if(!customer||ranked[0].score<.28){
          throw new Error(
            `مشتری «${result.customer_name||''}» پیدا نشد.`
          )
        }

        const balance=customerBalance(
          customer.id,
          transactions
        )

        const response=
          balance>0
            ? `مانده حساب ${customerName(customer)}، ${formatMoney(balance)} تومان بدهی است.`
            : balance<0
              ? `${customerName(customer)}، ${formatMoney(Math.abs(balance))} تومان بستانکار است.`
              : `حساب ${customerName(customer)} تسویه است.`

        setAnswer(response)
        speak(response)
        return
      }

      if(action==='add_customer'){
        const response=
          `ساخت مشتری جدید «${result.customer_name||''}» تشخیص داده شد؛ فعلاً از بخش مشتری‌ها ثبتش کن.`

        setAnswer(response)
        speak(response)
        return
      }

      throw new Error(
        result.message||
        'منظور فرمان را کامل متوجه نشدم.'
      )

    }catch(aiError){
      console.error('AI assistant error:',aiError)

      /*
       * اگر اینترنت، اعتبار API یا Edge Function مشکل داشت،
       * تشخیص قبلی برنامه به‌عنوان پشتیبان اجرا می‌شود.
       */
      try{
        const parsed=parseVoice(q,customers)

        if(
          parsed.candidates.length>0 &&
          parsed.amount>0 &&
          parsed.type
        ){
          setSelectedCandidate(
            parsed.confident&&parsed.candidates[0]
              ? parsed.candidates[0].id
              : ''
          )

          setPending(parsed)

          const response=
            'هوش مصنوعی در دسترس نبود؛ نتیجه با تشخیص داخلی آماده شد. قبل از ثبت بررسی و تأیید کن.'

          setAnswer(response)
          notify?.(response,'warning')
          return
        }
      }catch(fallbackError){
        console.error('Fallback assistant error:',fallbackError)
      }

      const response=
        `دستیار هوشمند پاسخ نداد: ${aiError?.message||'خطای نامشخص'}`

      setAnswer(response)
      notify?.(response,'error')
    }finally{
      setBusy(false)
    }
  }

  async function confirmPending(){
    const customer=pending?.candidates.find(item=>item.id===selectedCandidate)
    if(!customer)return setAnswer('ابتدا مشتری درست را انتخاب کن.')
    try{
      setBusy(true)
      const stamp=new Date().toLocaleString('fa-IR')
      const description=pending.description?`${pending.description} | ثبت با دستیار | ${stamp}`:`ثبت با دستیار | ${stamp}`
      await addTransaction(storeId,customer.id,pending.type,pending.amount,description)
      const response=`${formatMoney(pending.amount)} ${pending.type==='payment'?'پرداخت':'نسیه'} برای ${customerName(customer)} ثبت شد.`
      setPending(null);setSelectedCandidate('');setAnswer(response);speak(response);notify?.('تراکنش با دستیار ثبت شد ✅','success');await onDone?.()
    }catch(error){setAnswer('خطا: '+error.message);notify?.('خطا: '+error.message,'error')}
    finally{setBusy(false)}
  }

  function voice(){
    const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition
    if(!Recognition)return setAnswer('مرورگر فرمان صوتی را پشتیبانی نمی‌کند.')
    const recognition=new Recognition();recognition.lang='fa-IR';recognition.interimResults=false;recognition.continuous=false;recognition.maxAlternatives=5
    setListening(true)
    recognition.onresult=event=>{const alternatives=Array.from(event.results?.[0]||[]).map(item=>item.transcript).filter(Boolean);const best=alternatives.map(t=>({t,p:parseVoice(t,customers)})).sort((a,b)=>(b.p.topScore+(b.p.amount?1:0)+(b.p.type?1:0))-(a.p.topScore+(a.p.amount?1:0)+(a.p.type?1:0)))[0];const transcript=best?.t||'';setText(transcript);setAnswer('شنیدم: «'+transcript+'» — نتیجه را بررسی کن.');run(transcript)}
    recognition.onend=()=>setListening(false)
    recognition.onerror=event=>{setListening(false);setAnswer(event.error==='not-allowed'?'اجازه میکروفن داده نشده است.':'صدا واضح دریافت نشد؛ دوباره بگو.')}
    recognition.start()
  }

  return <div className="assistant">
    <div className="assistant-title"><h3>🤖 دستیار حسابدار</h3>{onClose&&<button className="mini-action" onClick={onClose}><X size={18}/></button>}</div>
    <div className="bubble bot">{answer}</div>
    {pending&&<div className="assistant-confirm">
      <div className="confirm-title"><AlertTriangle size={20}/><b>تأیید قبل از ثبت</b></div>
      <p><span>مبلغ:</span><b>{formatMoney(pending.amount)}</b></p>
      <p><span>نوع:</span><b>{pending.type==='debt'?'نسیه':'پرداخت'}</b></p>
      <label>مشتری</label>
      {pending.candidates.length===1
        ? <div className="single-candidate">{customerName(pending.candidates[0])}</div>
        : <select value={selectedCandidate} onChange={event=>setSelectedCandidate(event.target.value)}><option value="">انتخاب مشتری درست</option>{pending.candidates.map(customer=><option key={customer.id} value={customer.id}>{customerName(customer)}</option>)}</select>}
      {pending.description&&<p><span>توضیح:</span><b>{pending.description}</b></p>}
      <div className="confirm-actions"><button disabled={busy||!selectedCandidate} onClick={confirmPending}><Check size={18}/> تأیید و ثبت</button><button className="cancel-btn" onClick={()=>{setPending(null);setSelectedCandidate('');setAnswer('ثبت لغو شد.')}}><X size={18}/> انصراف</button></div>
    </div>}
    <div className="quick-chips"><button className="chip" onClick={()=>setText('۱۰ هزار از حساب سامان کم کن')}>نمونه پرداخت</button><button className="chip" onClick={()=>setText('۲۰ هزار به حساب سامان اضافه کن')}>نمونه بدهی</button></div>
    <div className="assistant-row"><input value={text} onChange={event=>setText(event.target.value)} onKeyDown={event=>event.key==='Enter'&&!busy&&run()} placeholder="۱۵۳ هزار فخردولت باقرپور نسیه"/><button disabled={busy} onClick={()=>run()}><Send size={19}/></button><button className="mic" disabled={busy||listening} onClick={voice}><Mic size={19}/></button></div>
    {listening&&<div className="bubble user">در حال گوش دادن...</div>}
  </div>
}
function CustomerRoom({customer,transactions,onClose,onChanged,permissions,confirmDelete=true,storeId,notify}){
  const[name,setName]=useState(customerName(customer))
  const[phone,setPhone]=useState(customer.phone||'')
  const[notes,setNotes]=useState(customer.notes||'')
  const[editing,setEditing]=useState(null)
  const[quickType,setQuickType]=useState(null)
  const[quickAmount,setQuickAmount]=useState('')
  const[quickDesc,setQuickDesc]=useState('')
  const[msg,setMsg]=useState('')
  const[saving,setSaving]=useState(false)
  const items=transactions.filter(item=>item.customer_id===customer.id)
  const debt=items.filter(item=>item.type==='debt').reduce((sum,item)=>sum+Number(item.amount),0)
  const pay=items.filter(item=>item.type==='payment').reduce((sum,item)=>sum+Number(item.amount),0)

  useEffect(()=>{if(!msg)return;const timer=setTimeout(()=>setMsg(''),2800);return()=>clearTimeout(timer)},[msg])

  async function saveCustomer(){
    if(!name.trim())return setMsg('نام مشتری خالی است.')
    try{setSaving(true);await updateCustomer(customer.id,{name:name.trim(),phone:phone.trim(),notes:notes.trim()});setMsg('اطلاعات مشتری ذخیره شد ✅');notify?.('اطلاعات مشتری ذخیره شد ✅','success');await onChanged?.()}
    catch(error){setMsg('خطا در ویرایش مشتری: '+error.message)}finally{setSaving(false)}
  }
  async function saveTx(){
    const value=Number(toEnglishDigits(editing?.amount||0).replace(/[^0-9.]/g,''))
    if(!editing?.id||!(value>0))return setMsg('مبلغ تراکنش معتبر نیست.')
    try{setSaving(true);await updateTransaction(editing.id,{type:editing.type,amount:value,description:editing.description||''});setEditing(null);setMsg('تراکنش ویرایش شد ✅');notify?.('تراکنش ویرایش شد ✅','success');await onChanged?.()}
    catch(error){setMsg('خطا در ویرایش تراکنش: '+error.message)}finally{setSaving(false)}
  }
  async function saveQuickTransaction(){
    const value=safeCalc(quickAmount)
    if(!quickType||!value)return setMsg('نوع و مبلغ تراکنش را وارد کن.')
    try{setSaving(true);await addTransaction(storeId,customer.id,quickType,value,quickDesc);setQuickType(null);setQuickAmount('');setQuickDesc('');setMsg(quickType==='debt'?'نسیه ثبت شد ✅':'پرداخت ثبت شد ✅');notify?.(quickType==='debt'?'نسیه ثبت شد ✅':'پرداخت ثبت شد ✅','success');await onChanged?.()}
    catch(error){setMsg('خطا: '+error.message)}finally{setSaving(false)}
  }

  async function exportCustomerPdf(){
    try{
      setSaving(true)
      notify?.('در حال ساخت گزارش PDF…','success')
      const balance=debt-pay
      const report=document.createElement('div')
      report.dir='rtl'
      report.style.cssText='position:fixed;left:-10000px;top:0;width:794px;background:#fff;color:#111;padding:42px;font-family:Tahoma,Arial,sans-serif;line-height:1.8;z-index:-1'
      const rows=items.map((item,index)=>`<tr><td>${index+1}</td><td>${new Date(item.created_at).toLocaleString('fa-IR')}</td><td>${item.type==='debt'?'نسیه':'پرداخت'}</td><td>${formatMoney(item.amount)}</td><td>${String(item.description||'—').replace(/[<>]/g,'')}</td></tr>`).join('')
      report.innerHTML=`<div style="text-align:center;border-bottom:3px solid #2563eb;padding-bottom:18px"><h1 style="margin:0;color:#173b7a">صورتحساب مشتری</h1><div>فروشگاه: ${String(storeId?'فروشگاه من':'فروشگاه').replace(/[<>]/g,'')}</div></div><div style="margin:24px 0;font-size:20px"><b>نام مشتری:</b> ${String(customerName(customer)).replace(/[<>]/g,'')}<br><b>شماره موبایل:</b> ${String(customer.phone||'ثبت نشده').replace(/[<>]/g,'')}<br><b>تاریخ تهیه گزارش:</b> ${new Date().toLocaleString('fa-IR')}</div><div style="display:flex;gap:14px;margin:20px 0"><div style="flex:1;padding:15px;background:#fff1f2;border-radius:12px"><b>جمع نسیه</b><br>${formatMoney(debt)}</div><div style="flex:1;padding:15px;background:#ecfdf5;border-radius:12px"><b>جمع پرداخت</b><br>${formatMoney(pay)}</div><div style="flex:1;padding:15px;background:#eff6ff;border-radius:12px"><b>مانده حساب</b><br>${formatMoney(balance)}</div></div><table style="width:100%;border-collapse:collapse;font-size:14px"><thead><tr style="background:#2563eb;color:#fff"><th>ردیف</th><th>تاریخ</th><th>نوع</th><th>مبلغ</th><th>توضیحات</th></tr></thead><tbody>${rows||'<tr><td colspan="5">تراکنشی ثبت نشده است.</td></tr>'}</tbody></table><div style="margin-top:28px;border-top:1px solid #aaa;padding-top:12px;font-size:13px;color:#555">این گزارش از برنامه حسابدار تهیه شده است.</div>`
      report.querySelectorAll('td,th').forEach(el=>el.style.cssText='border:1px solid #bbb;padding:8px;text-align:center;vertical-align:top')
      document.body.appendChild(report)
      const canvas=await html2canvas(report,{scale:2,backgroundColor:'#ffffff',useCORS:true})
      report.remove()
      const pdf=new jsPDF({orientation:'p',unit:'mm',format:'a4'})
      const pageW=210,pageH=297,margin=8,imgW=pageW-margin*2,imgH=canvas.height*imgW/canvas.width
      const img=canvas.toDataURL('image/jpeg',.94)
      let heightLeft=imgH,position=margin
      pdf.addImage(img,'JPEG',margin,position,imgW,imgH)
      heightLeft-=pageH-margin*2
      while(heightLeft>0){position=margin-(imgH-heightLeft);pdf.addPage();pdf.addImage(img,'JPEG',margin,position,imgW,imgH);heightLeft-=pageH-margin*2}
      const safeName=customerName(customer).replace(/[^\u0600-\u06FFa-zA-Z0-9_-]+/g,'-')
      const file=new File([pdf.output('blob')],`صورتحساب-${safeName}.pdf`,{type:'application/pdf'})
      if(navigator.share&&navigator.canShare?.({files:[file]}))await navigator.share({title:`صورتحساب ${customerName(customer)}`,text:`صورتحساب و تاریخچه تراکنش‌های ${customerName(customer)}`,files:[file]})
      else{const url=URL.createObjectURL(file);const a=document.createElement('a');a.href=url;a.download=file.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),3000)}
      notify?.('فایل PDF آماده شد ✅','success')
    }catch(error){notify?.('خطا در ساخت PDF: '+error.message,'error')}
    finally{setSaving(false)}
  }

  return <div className="modal-backdrop"><section className="modal-card customer-room-card">
    <div className="modal-head"><button className="back-button" onClick={onClose}><ArrowRight size={20}/> بازگشت</button><div><h2>اتاق {customerName(customer)}</h2><small>جزئیات کامل حساب مشتری</small></div><button className="mini-action" onClick={onClose}><X/></button></div>
    {msg&&<div className="snack room-snack"><span>{msg}</span><button onClick={()=>setMsg('')}><X size={16}/></button></div>}
    <div className="room-stats"><div><span>بدهی</span><b>{formatMoney(debt)}</b></div><div><span>پرداخت</span><b>{formatMoney(pay)}</b></div><div><span>مانده</span><b>{formatMoney(debt-pay)}</b></div></div>
    <div className="room-quick-actions"><button onClick={()=>setQuickType('debt')}><Plus size={18}/> ثبت نسیه</button><button className="payment" onClick={()=>setQuickType('payment')}><Wallet size={18}/> ثبت پرداخت</button></div><button className="customer-pdf-button" disabled={saving} onClick={exportCustomerPdf}><FileText size={19}/> ساخت و ارسال صورتحساب PDF <Share2 size={17}/></button>
    {quickType&&<div className="quick-transaction-box"><h3>{quickType==='debt'?'ثبت نسیه':'ثبت پرداخت'} برای {customerName(customer)}</h3><input value={quickAmount} onChange={event=>setQuickAmount(formatAmountInput(event.target.value))} placeholder="مبلغ" inputMode="numeric"/><small className="amount-words">{amountToWords(safeCalc(quickAmount))}</small><MiniCalculator onApply={value=>setQuickAmount(formatAmountInput(value))}/><input value={quickDesc} onChange={event=>setQuickDesc(event.target.value)} placeholder="توضیحات"/><div className="editor-actions"><button disabled={saving} onClick={saveQuickTransaction}><Save size={18}/> ثبت</button><button className="cancel-btn" onClick={()=>setQuickType(null)}>انصراف</button></div></div>}
    {editing&&<div className="edit-box transaction-editor"><h3><Edit3 size={18}/> ویرایش تراکنش</h3><select value={editing.type} onChange={event=>setEditing({...editing,type:event.target.value})}><option value="debt">نسیه</option><option value="payment">پرداخت</option></select><input inputMode="numeric" value={editing.amount} onChange={event=>setEditing({...editing,amount:formatAmountInput(event.target.value)})} placeholder="مبلغ"/><textarea value={editing.description||''} onChange={event=>setEditing({...editing,description:event.target.value})} placeholder="توضیحات"/><div className="editor-actions"><button disabled={saving} onClick={saveTx}><Save size={18}/> ذخیره ویرایش</button><button className="cancel-btn" onClick={()=>setEditing(null)}>انصراف</button></div></div>}
    {permissions.edit_customer&&<div className="edit-box"><h3><Edit3 size={18}/> ویرایش مشتری</h3><input value={name} onChange={event=>setName(event.target.value)} placeholder="نام"/><input value={phone} onChange={event=>setPhone(event.target.value)} placeholder="موبایل"/><textarea value={notes} onChange={event=>setNotes(event.target.value)} placeholder="یادداشت"/><button disabled={saving} onClick={saveCustomer}><Save size={18}/> ذخیره تغییرات</button></div>}
    <h3>تاریخچه تراکنش‌ها</h3>
    <div className="tx-list">{items.length===0&&<p>تراکنشی ثبت نشده.</p>}{items.map(item=><div className="tx-card" key={item.id}><div><b>{item.type==='debt'?'نسیه':'پرداخت'} — {formatMoney(item.amount)}</b><small>{new Date(item.created_at).toLocaleString('fa-IR')}</small><p>{item.description||'بدون توضیح'}</p></div><div className="tx-actions">{permissions.edit_transaction&&<button title="ویرایش تراکنش" onClick={()=>setEditing({...item,amount:formatAmountInput(item.amount)})}><Edit3 size={16}/></button>}{permissions.delete_transaction&&<button className="danger" onClick={async()=>{if(!confirmDelete||confirm('این تراکنش حذف شود؟')){try{await softDeleteTransaction(item.id);setMsg('تراکنش حذف شد.');notify?.('تراکنش به سطل زباله منتقل شد','success');await onChanged?.()}catch(error){setMsg('خطا: '+error.message)}}}}><Trash2 size={16}/></button>}</div></div>)}</div>
  </section></div>
}

function TrashRoom({
  customers,
  transactions,
  onClose,
  onChanged
}){
  const[selectedCustomers,setSelectedCustomers]=useState([])
  const[selectedTransactions,setSelectedTransactions]=useState([])
  const[tab,setTab]=useState('customers')
  const[msg,setMsg]=useState('')
  const[busy,setBusy]=useState(false)

  function toggleCustomer(id){
    setSelectedCustomers(current=>
      current.includes(id)
        ? current.filter(x=>x!==id)
        : [...current,id]
    )
  }

  function toggleTransaction(id){
    setSelectedTransactions(current=>
      current.includes(id)
        ? current.filter(x=>x!==id)
        : [...current,id]
    )
  }

  async function restoreSelected(){
    try{
      setBusy(true)

      for(const id of selectedCustomers){
        await restoreCustomer(id)
      }

      for(const id of selectedTransactions){
        await restoreTransaction(id)
      }

      setSelectedCustomers([])
      setSelectedTransactions([])
      setMsg('موارد انتخاب‌شده بازگردانی شدند ✅')
      await onChanged?.()
    }catch(e){
      setMsg('خطا در بازگردانی: '+e.message)
    }finally{
      setBusy(false)
    }
  }

  async function deleteSelected(){
    const count=selectedCustomers.length+selectedTransactions.length

    if(!count){
      setMsg('ابتدا یک یا چند مورد را انتخاب کنید.')
      return
    }

    if(
      prompt(
        'برای حذف دائمی '+count+
        ' مورد، کلمه حذف را بنویسید.'
      )!=='حذف'
    ) return

    try{
      setBusy(true)

      for(const id of selectedTransactions){
        await hardDeleteTransaction(id)
      }

      for(const id of selectedCustomers){
        await hardDeleteCustomer(id)
      }

      setSelectedCustomers([])
      setSelectedTransactions([])
      setMsg('موارد انتخاب‌شده برای همیشه حذف شدند.')
      await onChanged?.()
    }catch(e){
      setMsg('خطا در حذف دائمی: '+e.message)
    }finally{
      setBusy(false)
    }
  }

  const selectedCount=
    selectedCustomers.length+selectedTransactions.length

  return <div className="modal-backdrop trash-backdrop">
    <section className="modal-card trash-room">
      <div className="modal-head">
        <div>
          <h2>🗑️ سطل زباله</h2>
          <small>بازگردانی یا حذف دائمی موارد انتخاب‌شده</small>
        </div>

        <button className="mini-action" onClick={onClose}>
          <X/>
        </button>
      </div>

      <div className="trash-tabs">
        <button
          className={tab==='customers'?'active':''}
          onClick={()=>setTab('customers')}
        >
          مشتری‌ها ({customers.length})
        </button>

        <button
          className={tab==='transactions'?'active':''}
          onClick={()=>setTab('transactions')}
        >
          تراکنش‌ها ({transactions.length})
        </button>
      </div>

      {msg&&<div className="manager-message">{msg}</div>}

      {tab==='customers'&&
        <div className="trash-items">
          {customers.length===0&&
            <p className="empty-state">
              مشتری حذف‌شده‌ای وجود ندارد.
            </p>
          }

          {customers.map(customer=>
            <label className="trash-select-row" key={customer.id}>
              <input
                type="checkbox"
                checked={selectedCustomers.includes(customer.id)}
                onChange={()=>toggleCustomer(customer.id)}
              />

              <span>
                <b>{customerName(customer)}</b>
                <small>
                  {customer.phone||'بدون شماره موبایل'}
                </small>
              </span>
            </label>
          )}
        </div>
      }

      {tab==='transactions'&&
        <div className="trash-items">
          {transactions.length===0&&
            <p className="empty-state">
              تراکنش حذف‌شده‌ای وجود ندارد.
            </p>
          }

          {transactions.map(transaction=>
            <label className="trash-select-row" key={transaction.id}>
              <input
                type="checkbox"
                checked={selectedTransactions.includes(transaction.id)}
                onChange={()=>toggleTransaction(transaction.id)}
              />

              <span>
                <b>
                  {transaction.customer_name||'مشتری'} —{' '}
                  {transaction.type==='debt'?'نسیه':'پرداخت'}
                </b>

                <small>
                  {formatMoney(transaction.amount)}
                  {' | '}
                  {transaction.created_at
                    ? new Date(transaction.created_at)
                        .toLocaleString('fa-IR')
                    : 'بدون تاریخ'
                  }
                </small>

                {transaction.description&&
                  <small>{transaction.description}</small>
                }
              </span>
            </label>
          )}
        </div>
      }

      <div className="trash-actions">
        <button
          disabled={busy||selectedCount===0}
          onClick={restoreSelected}
        >
          <RotateCcw size={18}/>
          بازگردانی انتخاب‌شده‌ها ({selectedCount})
        </button>

        <button
          className="danger"
          disabled={busy||selectedCount===0}
          onClick={deleteSelected}
        >
          <Trash2 size={18}/>
          حذف دائمی
        </button>
      </div>
    </section>
  </div>
}

function StaffManager({storeId}){
  const[staff,setStaff]=useState([])
  const[email,setEmail]=useState('')
  const[permissions,setPermissions]=useState({...DEFAULT_PERMISSIONS})
  const[msg,setMsg]=useState('')
  const[loading,setLoading]=useState(false)
  const[editingId,setEditingId]=useState(null)
  const permissionLabels={view_customers:'مشاهده مشتری‌ها',add_debt:'ثبت بدهی',add_payment:'ثبت پرداخت',edit_customer:'ویرایش مشتری',delete_customer:'حذف مشتری',edit_transaction:'ویرایش تراکنش',delete_transaction:'حذف تراکنش',view_reports:'مشاهده گزارش‌ها',use_assistant:'استفاده از دستیار'}

  async function load(){
    if(!storeId)return setMsg('فروشگاه هنوز متصل نشده است.')
    try{setLoading(true);setStaff(await loadStaff(storeId));setMsg('')}
    catch(e){setMsg('خطا در دریافت کارکنان: '+e.message)}finally{setLoading(false)}
  }
  useEffect(()=>{load()},[storeId])

  async function add(){
    if(!email.trim())return setMsg('ایمیل کارمند را وارد کنید.')
    try{setLoading(true);await saveStaff(storeId,{email,role:'staff',active:true,permissions});setEmail('');setPermissions({...DEFAULT_PERMISSIONS});setMsg('کارمند اضافه شد ✅');await load()}
    catch(e){setMsg('خطا در افزودن کارمند: '+e.message)}finally{setLoading(false)}
  }
  async function saveExisting(item,patch={}){
    try{setLoading(true);await saveStaff(storeId,{email:item.user_email,role:item.role||'staff',active:item.active!==false,permissions:item.permissions||{},...patch});setMsg('تغییرات کارمند ذخیره شد ✅');await load()}
    catch(e){setMsg('خطا: '+e.message)}finally{setLoading(false)}
  }

  return <div className="staff-manager-card">
    <div className="manager-intro"><ShieldCheck size={28}/><div><h3>پنل مدیر اصلی</h3><p>کارمند را با ایمیل اضافه کن و دسترسی‌هایش را مشخص کن.</p></div></div>
    <div className="staff-form"><input value={email} onChange={e=>setEmail(e.target.value)} placeholder="ایمیل کارمند" type="email"/><div className="permissions">{Object.entries(permissionLabels).map(([k,label])=><label key={k}><input type="checkbox" checked={!!permissions[k]} onChange={e=>setPermissions({...permissions,[k]:e.target.checked})}/>{label}</label>)}</div><button onClick={add} disabled={loading}><Plus size={18}/>{loading?'در حال ذخیره...':'افزودن کارمند'}</button></div>
    {msg&&<div className="manager-message">{msg}</div>}
    <div className="list staff-list">{staff.length===0&&!loading&&<p className="empty-state">هنوز کارمندی اضافه نشده است.</p>}{staff.map(item=><div className="staff-item" key={item.id}><div className="staff-summary"><span><b>{item.user_email}</b><small>{item.active===false?'غیرفعال':'فعال'} • {item.role==='owner'?'مدیر اصلی':'کارمند'}</small></span><div className="staff-actions"><button onClick={()=>setEditingId(editingId===item.id?null:item.id)}><Edit3 size={16}/>دسترسی‌ها</button>{item.role!=='owner'&&<button onClick={()=>saveExisting(item,{active:item.active===false})}>{item.active===false?'فعال‌کردن':'غیرفعال‌کردن'}</button>}{item.role!=='owner'&&<button className="danger" onClick={async()=>{if(confirm('این کارمند حذف شود؟')){try{await removeStaff(item.id);setMsg('کارمند حذف شد.');await load()}catch(e){setMsg('خطا: '+e.message)}}}}><Trash2 size={16}/></button>}</div></div>{editingId===item.id&&<div className="staff-permission-editor">{Object.entries(permissionLabels).map(([k,label])=><label key={k}><input type="checkbox" checked={!!(item.permissions||{})[k]} onChange={e=>setStaff(current=>current.map(x=>x.id===item.id?{...x,permissions:{...(x.permissions||{}),[k]:e.target.checked}}:x))}/>{label}</label>)}<button onClick={()=>saveExisting(item,{permissions:item.permissions||{}})}><Save size={17}/>ذخیره دسترسی‌ها</button></div>}</div>)}</div>
  </div>
}
function Toast({toast,onClose}){
  useEffect(()=>{if(!toast)return;const timer=setTimeout(onClose,2800);return()=>clearTimeout(timer)},[toast,onClose])
  if(!toast)return null
  return <div className={'global-toast '+(toast.type||'success')}><span>{toast.text}</span><button onClick={onClose}><X size={16}/></button></div>
}

function App(){
  const[session,setSession]=useState(null)
  const[store,setStore]=useState(null)
  const[customers,setCustomers]=useState([])
  const[deleted,setDeleted]=useState([])
  const[deletedTransactions,setDeletedTransactions]=useState([])
  const[transactions,setTransactions]=useState([])
  const[open,setOpen]=useState('quick')
  const[q,setQ]=useState('')
  const[aiOpen,setAiOpen]=useState(false)
  const[room,setRoom]=useState(null)
  const[name,setName]=useState('')
  const[phone,setPhone]=useState('')
  const[selected,setSelected]=useState('')
  const[type,setType]=useState('debt')
  const[amountText,setAmountText]=useState('')
  const[desc,setDesc]=useState('')
  const[msg,setMsg]=useState('')
  const[toast,setToast]=useState(null)
  const[tab,setTab]=useState('operations')
  const[trashOpen,setTrashOpen]=useState(false)
  const[menuOpen,setMenuOpen]=useState(false)
  const[menuView,setMenuView]=useState('')

  const[theme,setTheme]=useState(
    ()=>localStorage.getItem('hesabdar_theme')||'light'
  )

  const[fontSize,setFontSize]=useState(
    ()=>localStorage.getItem('hesabdar_font_size')||'normal'
  )

  const[showAmountWords,setShowAmountWords]=useState(
    ()=>localStorage.getItem('hesabdar_amount_words')!=='false'
  )

  const[confirmDelete,setConfirmDelete]=useState(
    ()=>localStorage.getItem('hesabdar_confirm_delete')!=='false'
  )

  const permissions=store?.access?.permissions||DEFAULT_PERMISSIONS
  const amount=safeCalc(amountText)

  function goToSection(tabName,openName,sectionKey){
    setTab(tabName)
    setOpen(openName)
    window.setTimeout(()=>{
      const target=document.querySelector(`[data-section="${sectionKey}"]`)
      if(target){
        target.scrollIntoView({behavior:'smooth',block:'start'})
      }else{
        window.scrollTo({top:0,behavior:'smooth'})
      }
    },80)
  }

  const activeCustomers=useMemo(
    ()=>customers.filter(
      c=>(customerName(c)+' '+(c.phone||'')).includes(q)
    ),
    [customers,q]
  )

  const total=useMemo(
    ()=>customers.reduce(
      (sum,customer)=>sum+customerBalance(customer.id,transactions),
      0
    ),
    [customers,transactions]
  )

  const accountTotals=useMemo(()=>({
    debt:transactions.filter(item=>item.type==='debt').reduce((sum,item)=>sum+Number(item.amount||0),0),
    payment:transactions.filter(item=>item.type==='payment').reduce((sum,item)=>sum+Number(item.amount||0),0)
  }),[transactions])

  const todayStats=useMemo(()=>{
    const today=new Date().toISOString().slice(0,10)

    const items=transactions.filter(
      item=>String(item.created_at||'').slice(0,10)===today
    )

    return{
      debt:items
        .filter(item=>item.type==='debt')
        .reduce((sum,item)=>sum+Number(item.amount),0),

      pay:items
        .filter(item=>item.type==='payment')
        .reduce((sum,item)=>sum+Number(item.amount),0)
    }
  },[transactions])

  const resolvedTheme=
    theme==='system'
      ? (
          window.matchMedia?.('(prefers-color-scheme: dark)').matches
            ? 'dark'
            : 'light'
        )
      : theme

  useEffect(()=>{
    document.documentElement.dataset.theme=resolvedTheme
    localStorage.setItem('hesabdar_theme',theme)
  },[theme,resolvedTheme])

  useEffect(()=>{
    localStorage.setItem('hesabdar_font_size',fontSize)
    localStorage.setItem(
      'hesabdar_amount_words',
      String(showAmountWords)
    )
    localStorage.setItem(
      'hesabdar_confirm_delete',
      String(confirmDelete)
    )
  },[fontSize,showAmountWords,confirmDelete])

  function notify(text,type='success'){
    setToast({text,type,id:Date.now()})
  }

  useEffect(()=>{
    if(!msg)return
    const timer=setTimeout(()=>setMsg(''),2800)
    return()=>clearTimeout(timer)
  },[msg])

  useEffect(()=>{
    const handleBack=()=>{
      if(menuOpen){setMenuOpen(false);history.pushState({hesabdar:true},'');return}
      if(menuView){setMenuView('');history.pushState({hesabdar:true},'');return}
      if(trashOpen){setTrashOpen(false);history.pushState({hesabdar:true},'');return}
      if(room){setRoom(null);history.pushState({hesabdar:true},'');return}
      if(aiOpen){setAiOpen(false);history.pushState({hesabdar:true},'');return}
      if(tab!=='operations'){setTab('operations');setOpen('quick');history.pushState({hesabdar:true},'');return}
    }
    history.pushState({hesabdar:true},'')
    window.addEventListener('popstate',handleBack)
    return()=>window.removeEventListener('popstate',handleBack)
  },[menuOpen,menuView,trashOpen,room,aiOpen,tab])

  async function boot(){
    try{
      const currentSession=await getSession()
      setSession(currentSession)

      if(currentSession){
        const currentStore=await getStore()
        setStore(currentStore)

        if(currentStore){
          setCustomers(
            await loadCustomers(currentStore.id,false)
          )

          setDeleted(
            (await loadCustomers(currentStore.id,true))
              .filter(item=>item.is_deleted)
          )

          setTransactions(
            await loadTransactions(currentStore.id)
          )

          setDeletedTransactions(
            (await loadTransactions(currentStore.id,true))
              .filter(item=>item.is_deleted)
          )
        }
      }
    }catch(error){
      setMsg(error.message)
    }
  }

  useEffect(()=>{
    boot()

    const{data}=supabase.auth.onAuthStateChange(()=>boot())

    return()=>data.subscription.unsubscribe()
  },[])

  async function createCustomer(event){
    event.preventDefault()

    if(!name.trim()){
      setMsg('نام مشتری را وارد کنید')
      return
    }

    if(!store?.id){
      setMsg('فروشگاه هنوز وصل نشده است')
      return
    }

    try{
      await addCustomer(store.id,name,phone)
      setName('')
      setPhone('')
      notify('مشتری جدید ثبت شد ✅','success')
      await boot()
    }catch(error){
      setMsg(error.message)
    }
  }

  async function createTransaction(event){
    event.preventDefault()

    if(!selected||!amount){
      setMsg('مشتری و مبلغ را وارد کن')
      return
    }

    if(type==='debt'&&!permissions.add_debt){
      setMsg('اجازه ثبت بدهی ندارید')
      return
    }

    if(type==='payment'&&!permissions.add_payment){
      setMsg('اجازه ثبت پرداخت ندارید')
      return
    }

    try{
      await addTransaction(
        store.id,
        selected,
        type,
        amount,
        desc
      )

      setAmountText('')
      setDesc('')
      notify(type==='debt'?'نسیه ثبت شد ✅':'پرداخت ثبت شد ✅','success')
      await boot()
    }catch(error){
      setMsg(error.message)
    }
  }

  function openMenuView(view){
    setMenuOpen(false)

    if(view==='trash'){
      setTrashOpen(true)
      return
    }

    setMenuView(view)
  }

  async function logout(){
    await signOut()
    setSession(null)
    setMenuOpen(false)
    setMenuView('')
  }

  if(!session){
    return <Auth onAuth={boot}/>
  }

  return <main className={'app tab-'+tab+' font-'+fontSize}>
    <Toast toast={toast} onClose={()=>setToast(null)}/>
    <header className="top app-toolbar">
      <button
        className="toolbar-icon"
        aria-label="باز کردن منو"
        onClick={()=>setMenuOpen(true)}
      >
        <Menu/>
      </button>

      <div className="toolbar-title">
        <h1>حسابدار</h1>
        <p>
          {store?.name||'فروشگاه من'}
          {' — '}
          {store?.access?.role==='owner'
            ? 'مدیر اصلی'
            : 'کارمند'
          }
        </p>
      </div>

      <button
        className={
          'power-switch '+
          (resolvedTheme==='dark'?'is-dark':'is-light')
        }
        aria-label="تغییر حالت روشن و تاریک"
        onClick={()=>
          setTheme(
            resolvedTheme==='dark'?'light':'dark'
          )
        }
      >
        <span className="power-track">
          <span className="power-knob">
            {resolvedTheme==='dark'
              ? <Moon size={15}/>
              : <Sun size={15}/>
            }
          </span>
        </span>
      </button>
    </header>

    <section className="v1-welcome">
      <div className="v1-brand-row">
        <div><small>{store?.name||'فروشگاه من'}</small><h2>دفتر حساب من</h2></div>
        <button className="v1-refresh" onClick={boot}><RefreshCw size={20}/></button>
      </div>
      <div className="v1-balance-card">
        <span>مانده کل حساب‌ها</span>
        <strong>{formatMoney(total)} <small>تومان</small></strong>
        <div className="v1-balance-grid">
          <div><small>مجموع طلب</small><b>{formatMoney(accountTotals.debt)}</b></div>
          <div><small>مجموع پرداخت</small><b>{formatMoney(accountTotals.payment)}</b></div>
        </div>
      </div>
      <div className="v1-quick-row">
        <button className="debt" onClick={()=>{setType('debt');goToSection('operations','quick','operations')}}><Plus/> ثبت طلب</button>
        <button className="payment" onClick={()=>{setType('payment');goToSection('operations','quick','operations')}}><RefreshCw/> ثبت پرداخت</button>
      </div>
    </section>

    {msg&&
      <div className="snack">
        <span>{msg}</span>

        <button onClick={()=>setMsg('')}>
          <X/>
        </button>
      </div>
    }

    <section className="stats page-operations">
      <button type="button" className="stat stat-button" onClick={()=>goToSection('operations','quick','operations')}>
        <Wallet/>
        <span>مانده حساب</span>
        <b>{formatMoney(total)}</b>
      </button>

      <button type="button" className="stat stat-button" onClick={()=>goToSection('customers','customers','customers')}>
        <Users/>
        <span>مشتری‌ها</span>
        <b>{customers.length}</b>
      </button>

      <button type="button" className="stat stat-button" onClick={()=>goToSection('reports','reports','reports')}>
        <BarChart3/>
        <span>نسیه امروز</span>
        <b>{formatMoney(todayStats.debt)}</b>
      </button>

      <button type="button" className="stat stat-button" onClick={()=>goToSection('reports','reports','reports')}>
        <RefreshCw/>
        <span>پرداخت امروز</span>
        <b>{formatMoney(todayStats.pay)}</b>
      </button>
    </section>

    <Glass
      sectionKey="operations"
      title="عملیات سریع"
      sub="ثبت مشتری، نسیه و پرداخت"
      icon={Plus}
      open={open==='quick'}
      onToggle={()=>
        setOpen(open==='quick'?'':'quick')
      }
    >
      <form
        onSubmit={createCustomer}
        className="grid"
      >
        <h3>ثبت مشتری جدید</h3>

        <input
          value={name}
          onChange={event=>setName(event.target.value)}
          placeholder="نام مشتری"
        />

        <input
          value={phone}
          onChange={event=>setPhone(event.target.value)}
          placeholder="شماره موبایل"
        />

        <button>ثبت مشتری</button>
      </form>

      <form
        onSubmit={createTransaction}
        className="grid"
      >
        <h3>ثبت تراکنش</h3>

        <div className="toggle">
          <button
            type="button"
            className={type==='debt'?'on':''}
            onClick={()=>setType('debt')}
          >
            نسیه
          </button>

          <button
            type="button"
            className={type==='payment'?'on':''}
            onClick={()=>setType('payment')}
          >
            پرداخت
          </button>
        </div>

        <CustomerPicker customers={customers} value={selected} onChange={setSelected}/>

        <input
          value={amountText}
          onChange={event=>
            setAmountText(
              formatAmountInput(event.target.value)
            )
          }
          placeholder="مثلا 10000"
        />

        <div className="calc">
          {formatMoney(amount)}
        </div>

        {showAmountWords&&
          <small className="amount-words">
            {amountToWords(amount)}
          </small>
        }

        <MiniCalculator onApply={value=>setAmountText(formatAmountInput(value))}/>

        <input
          value={desc}
          onChange={event=>setDesc(event.target.value)}
          placeholder="توضیح"
        />

        <button>ثبت</button>
      </form>
    </Glass>

    {permissions.view_customers&&
      <Glass
        sectionKey="customers"
        title="مشتری‌ها"
        sub="فهرست مشتری‌ها و افزودن مشتری جدید"
        icon={Users}
        open={open==='customers'}
        onToggle={()=>
          setOpen(
            open==='customers'?'':'customers'
          )
        }
      >
        <form
          onSubmit={createCustomer}
          className="grid customer-tab-add"
        >
          <h3>
            <Plus size={18}/>
            افزودن مشتری جدید
          </h3>

          <input
            value={name}
            onChange={event=>setName(event.target.value)}
            placeholder="نام مشتری"
          />

          <input
            value={phone}
            onChange={event=>setPhone(event.target.value)}
            placeholder="شماره موبایل"
          />

          <button>
            <Plus size={18}/>
            ثبت مشتری
          </button>
        </form>

        <div className="search">
          <Search/>

          <input
            value={q}
            onChange={event=>setQ(event.target.value)}
            placeholder="جستجو"
          />
        </div>

        <div className="list">
          {activeCustomers.map(customer=>
            <div
              className="row clickable"
              key={customer.id}
              onClick={()=>setRoom(customer)}
            >
              <span>
                <b>{customerName(customer)}</b>

                <small>
                  {customer.phone||'بدون موبایل'}
                  {' | '}
                  {formatMoney(
                    customerBalance(
                      customer.id,
                      transactions
                    )
                  )}
                </small>
              </span>

              {permissions.delete_customer&&
                <button
                  className="danger"
                  onClick={async event=>{
                    event.stopPropagation()

                    if(
                      confirmDelete&&
                      !confirm('این مشتری حذف شود؟')
                    ){
                      return
                    }

                    await softDeleteCustomer(customer.id)
                    await boot()
                  }}
                >
                  <Trash2/>
                </button>
              }
            </div>
          )}
        </div>
      </Glass>
    }

    {permissions.view_reports&&
      <Glass
        sectionKey="reports"
        title="گزارش‌ها"
        sub="خلاصه وضعیت"
        icon={BarChart3}
        open={open==='reports'}
        onToggle={()=>
          setOpen(open==='reports'?'':'reports')
        }
      >
        <div className="report">
          <p>
            مانده کل:
            {' '}
            <b>{formatMoney(total)}</b>
          </p>

          <p>
            نسیه امروز:
            {' '}
            <b>{formatMoney(todayStats.debt)}</b>
          </p>

          <p>
            پرداخت امروز:
            {' '}
            <b>{formatMoney(todayStats.pay)}</b>
          </p>
        </div>
      </Glass>
    }

    <Glass
      sectionKey="assistant"
      title="دستیار حسابدار"
      sub="فرمان متنی و صوتی"
      icon={Bot}
      open={open==='ai'}
      onToggle={()=>
        setOpen(open==='ai'?'':'ai')
      }
    >
      <Assistant
        customers={customers}
        transactions={transactions}
        storeId={store?.id}
        onDone={boot}
        canUse={permissions.use_assistant}
        notify={notify}
      />
    </Glass>

    {trashOpen&&
      <TrashRoom
        customers={deleted}
        transactions={deletedTransactions}
        onClose={()=>setTrashOpen(false)}
        onChanged={boot}
      />
    }

    {room&&
      <CustomerRoom
        customer={room}
        transactions={transactions}
        onClose={()=>setRoom(null)}
        onChanged={boot}
        permissions={permissions}
        confirmDelete={confirmDelete}
        storeId={store?.id}
        notify={notify}
      />
    }

    {aiOpen&&
      <div className="assistant-panel">
        <Assistant
          customers={customers}
          transactions={transactions}
          storeId={store?.id}
          onDone={boot}
          onClose={()=>setAiOpen(false)}
          canUse={permissions.use_assistant}
          notify={notify}
        />
      </div>
    }

    <button
      className="fab pulse"
      onClick={()=>setAiOpen(true)}
    >
      <Bot size={30}/>
    </button>

    

<button
  type="button"
  className="v1-assistant-fab"
  onClick={()=>setAiOpen(true)}
  aria-label="دستیار"
>
  <Bot size={27}/>
</button>

<nav className="bottom-nav v1-bottom-nav">
  <button
    type="button"
    className={tab==='operations'?'active':''}
    onClick={()=>setTab('operations')}
  >
    <Home size={23}/>
    <span>عملیات</span>
  </button>

  <button
    type="button"
    className={tab==='customers'?'active':''}
    onClick={()=>setTab('customers')}
  >
    <Users size={23}/>
    <span>مشتری</span>
  </button>

  <button
    type="button"
    className={tab==='reports'?'active':''}
    onClick={()=>setTab('reports')}
  >
    <BarChart3 size={23}/>
    <span>گزارش</span>
  </button>
</nav>



    {menuOpen&&<>
      <button
        className="drawer-backdrop"
        aria-label="بستن منو"
        onClick={()=>setMenuOpen(false)}
      />

      <aside className="side-drawer">
        <div className="drawer-head">
          <div>
            <b>منوی حسابدار</b>
            <small>{store?.name||'فروشگاه من'}</small>
          </div>

          <button onClick={()=>setMenuOpen(false)}>
            <X/>
          </button>
        </div>

        <div className="drawer-menu">
          <button onClick={()=>openMenuView('trash')}>
            <Trash2/>
            <span>سطل زباله</span>
            <small>
              {deleted.length+deletedTransactions.length}
            </small>
          </button>

          {permissions.manage_staff&&
            <button onClick={()=>openMenuView('staff')}>
              <UserCog/>
              <span>مدیریت کارکنان</span>
            </button>
          }

          {store?.access?.role==='owner'&&
            <button onClick={()=>openMenuView('backup')}>
              <Settings/>
              <span>پشتیبان‌گیری و بازیابی</span>
            </button>
          }

          <button onClick={()=>openMenuView('settings')}>
            <SlidersHorizontal/>
            <span>تنظیمات</span>
          </button>

          <button onClick={()=>openMenuView('about')}>
            <Info/>
            <span>درباره و پشتیبانی</span>
          </button>

          <button
            className="drawer-logout"
            onClick={logout}
          >
            <LogOut/>
            <span>خروج از حساب</span>
          </button>
        </div>
      </aside>
    </>}

    {menuView&&
      <div
        className="menu-modal-backdrop"
        onMouseDown={event=>{
          if(event.target===event.currentTarget){
            setMenuView('')
          }
        }}
      >
        <section className="menu-modal-card">
          <div className="modal-head">
            <div>
              <h2>
                {menuView==='staff'
                  ? 'مدیریت کارکنان'
                  : menuView==='backup'
                    ? 'پشتیبان‌گیری و بازیابی'
                    : menuView==='settings'
                      ? 'تنظیمات'
                      : 'درباره و پشتیبانی'
                }
              </h2>

              <small>نسخه ۰.۹.۴ امن حسابدار</small>
            </div>

            <button
              className="mini-action"
              onClick={()=>setMenuView('')}
            >
              <X/>
            </button>
          </div>

          {menuView==='staff'&&
            permissions.manage_staff&&
            <StaffManager storeId={store?.id}/>
          }

          {menuView==='backup'&&
            store?.access?.role==='owner'&&
            <BackupManager
              store={store}
              onRestored={boot}
            />
          }

          {menuView==='settings'&&
            <div className="settings-panel">
              <div className="setting-row">
                <span>
                  <b>ظاهر برنامه</b>
                  <small>روشن، تاریک یا مطابق گوشی</small>
                </span>

                <select
                  value={theme}
                  onChange={event=>
                    setTheme(event.target.value)
                  }
                >
                  <option value="light">روشن</option>
                  <option value="dark">تاریک</option>
                  <option value="system">مطابق گوشی</option>
                </select>
              </div>

              <div className="setting-row">
                <span>
                  <b>اندازه نوشته</b>
                  <small>اندازه متن‌های برنامه</small>
                </span>

                <select
                  value={fontSize}
                  onChange={event=>
                    setFontSize(event.target.value)
                  }
                >
                  <option value="small">کوچک</option>
                  <option value="normal">معمولی</option>
                  <option value="large">بزرگ</option>
                </select>
              </div>

              <label className="setting-toggle">
                <span>
                  <b>نمایش مبلغ به حروف</b>
                  <small>
                    زیر مبلغ عددی نمایش داده شود
                  </small>
                </span>

                <input
                  type="checkbox"
                  checked={showAmountWords}
                  onChange={event=>
                    setShowAmountWords(event.target.checked)
                  }
                />
              </label>

              <label className="setting-toggle">
                <span>
                  <b>تأیید قبل از حذف</b>
                  <small>
                    برای جلوگیری از حذف اشتباهی
                  </small>
                </span>

                <input
                  type="checkbox"
                  checked={confirmDelete}
                  onChange={event=>
                    setConfirmDelete(event.target.checked)
                  }
                />
              </label>
            </div>
          }

          {menuView==='about'&&
            <div className="about menu-about">
              <p>
                <b>حسابدار نسخه ۰.۹</b>
              </p>

              <p>سازنده: سامان رفیعی</p>

              <p>
                مدیریت مشتری، نسیه، پرداخت، کارکنان،
                بکاپ و گزارش فروشگاه.
              </p>
            </div>
          }
        </section>
      </div>
    }
  </main>
}
createRoot(document.getElementById('root')).render(<App/>)

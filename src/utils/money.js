export function toEnglishDigits(input=''){
  const fa='۰۱۲۳۴۵۶۷۸۹', ar='٠١٢٣٤٥٦٧٨٩'
  return String(input).replace(/[۰-۹]/g,d=>fa.indexOf(d)).replace(/[٠-٩]/g,d=>ar.indexOf(d))
}
export function safeCalc(text=''){
  const raw=toEnglishDigits(text).replace(/,/g,'').replace(/تومان|تومن|هزار|ریال/g,'')
  if(!/^[0-9+\-*/().\s]+$/.test(raw)) return Number(toEnglishDigits(text).replace(/[^0-9]/g,''))||0
  try { const v=Function(`"use strict"; return (${raw})`)(); return Number.isFinite(v)?Math.round(v):0 } catch { return Number(toEnglishDigits(text).replace(/[^0-9]/g,''))||0 }
}
export function formatMoney(n=0){ return new Intl.NumberFormat('fa-IR').format(Number(n)||0)+' تومان' }
export function parseAmountFromText(text=''){
  const s=toEnglishDigits(text).replace(/,/g,'')
  const million=s.match(/(\d+(?:\.\d+)?)\s*(میلیون|ملیون)/)
  if(million) return Math.round(Number(million[1])*1000000)
  const hezar=s.match(/(\d+(?:\.\d+)?)\s*(هزار|هزارتا|هزار تومان)/)
  if(hezar) return Math.round(Number(hezar[1])*1000)
  const nums=s.match(/\d+/g)
  if(!nums) return 0
  return Number(nums.join('')) || 0
}


export function formatAmountInput(value){
  const digits=String(value??'')
    .replace(/[۰-۹]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[^\d]/g,'')
  if(!digits) return ''
  return Number(digits).toLocaleString('en-US')
}

export function amountToWords(value){
  const n=Math.floor(Number(String(value??'').replace(/,/g,''))||0)
  if(!n) return ''

  const ones=['','یک','دو','سه','چهار','پنج','شش','هفت','هشت','نه']
  const teens=['ده','یازده','دوازده','سیزده','چهارده','پانزده','شانزده','هفده','هجده','نوزده']
  const tens=['','','بیست','سی','چهل','پنجاه','شصت','هفتاد','هشتاد','نود']
  const hundreds=['','صد','دویست','سیصد','چهارصد','پانصد','ششصد','هفتصد','هشتصد','نهصد']
  const scales=['','هزار','میلیون','میلیارد','تریلیون']

  function under1000(x){
    const parts=[]
    const h=Math.floor(x/100)
    const r=x%100
    if(h) parts.push(hundreds[h])
    if(r>=10&&r<20) parts.push(teens[r-10])
    else{
      const t=Math.floor(r/10)
      const o=r%10
      if(t) parts.push(tens[t])
      if(o) parts.push(ones[o])
    }
    return parts.join(' و ')
  }

  const groups=[]
  let num=n
  let scale=0

  while(num>0){
    const part=num%1000
    if(part){
      const text=under1000(part)
      groups.unshift(text+(scales[scale]?' '+scales[scale]:''))
    }
    num=Math.floor(num/1000)
    scale++
  }

  return groups.join(' و ')+' تومان'
}


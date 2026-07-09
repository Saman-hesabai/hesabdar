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

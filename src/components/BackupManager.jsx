import React, { useEffect, useRef, useState } from 'react'
import {
  createBackupObject,
  downloadBackupFile,
  getBackupPreview,
  readBackupFile,
  restoreBackupObject,
  shareOrDownloadBackup
} from '../services/backup'

const AUTO_ENABLED_KEY='hesabdar_auto_backup_enabled'
const AUTO_HOURS_KEY='hesabdar_auto_backup_hours'
const LAST_BACKUP_KEY='hesabdar_last_auto_backup'

function formatDate(value){
  if(!value) return '\u0646\u0627\u0645\u0634\u062e\u0635'
  try{
    return new Date(value).toLocaleString('fa-IR')
  }catch{
    return String(value)
  }
}

export default function BackupManager({store,onRestored}){
  const fileInputRef=useRef(null)

  const [message,setMessage]=useState('')
  const [loading,setLoading]=useState(false)
  const [selectedBackup,setSelectedBackup]=useState(null)
  const [preview,setPreview]=useState(null)

  const [autoEnabled,setAutoEnabled]=useState(
    localStorage.getItem(AUTO_ENABLED_KEY)==='true'
  )

  const [autoHours,setAutoHours]=useState(
    Number(localStorage.getItem(AUTO_HOURS_KEY)||24)
  )

  const [lastAutoBackup,setLastAutoBackup]=useState(
    localStorage.getItem(LAST_BACKUP_KEY)||''
  )

  useEffect(()=>{
    localStorage.setItem(AUTO_ENABLED_KEY,String(autoEnabled))
    localStorage.setItem(AUTO_HOURS_KEY,String(autoHours))
  },[autoEnabled,autoHours])

  useEffect(()=>{
    if(!autoEnabled||!store?.id) return

    let running=false

    async function checkAutoBackup(){
      if(running) return
      if(document.visibilityState!=='visible') return

      const last=Number(localStorage.getItem(LAST_BACKUP_KEY)||0)
      const interval=Math.max(1,Number(autoHours)||24)*60*60*1000

      if(Date.now()-last<interval) return

      running=true

      try{
        setMessage('\u062f\u0631 \u062d\u0627\u0644 \u0633\u0627\u062e\u062a \u0628\u06a9\u0627\u067e \u062e\u0648\u062f\u06a9\u0627\u0631...')

        const backup=await createBackupObject(store.id)
        const result=downloadBackupFile(backup)
        const now=Date.now()

        localStorage.setItem(LAST_BACKUP_KEY,String(now))
        setLastAutoBackup(String(now))

        setMessage(
          '\u0628\u06a9\u0627\u067e \u062e\u0648\u062f\u06a9\u0627\u0631 \u0633\u0627\u062e\u062a\u0647 \u0634\u062f: '+result.filename
        )
      }catch(error){
        setMessage(
          '\u062e\u0637\u0627 \u062f\u0631 \u0628\u06a9\u0627\u067e \u062e\u0648\u062f\u06a9\u0627\u0631: '+error.message
        )
      }finally{
        running=false
      }
    }

    checkAutoBackup()
    const timer=setInterval(checkAutoBackup,60000)

    return()=>clearInterval(timer)
  },[autoEnabled,autoHours,store?.id])

  async function createManualBackup(){
    if(!store?.id){
      setMessage('\u0641\u0631\u0648\u0634\u06af\u0627\u0647 \u067e\u06cc\u062f\u0627 \u0646\u0634\u062f.')
      return
    }

    try{
      setLoading(true)
      setMessage('\u062f\u0631 \u062d\u0627\u0644 \u0633\u0627\u062e\u062a \u0641\u0627\u06cc\u0644 \u0628\u06a9\u0627\u067e...')

      const backup=await createBackupObject(store.id)
      const result=await shareOrDownloadBackup(backup)

      setMessage(
        result.method==='share'
          ? '\u0641\u0627\u06cc\u0644 \u0628\u06a9\u0627\u067e \u0628\u0631\u0627\u06cc \u0627\u0634\u062a\u0631\u0627\u06a9\u200c\u06af\u0630\u0627\u0631\u06cc \u0622\u0645\u0627\u062f\u0647 \u0634\u062f.'
          : '\u0641\u0627\u06cc\u0644 \u0628\u06a9\u0627\u067e \u062f\u0631 \u06af\u0648\u0634\u06cc \u0630\u062e\u06cc\u0631\u0647 \u0634\u062f: '+result.filename
      )
    }catch(error){
      if(error?.name==='AbortError'){
        setMessage('\u0627\u0634\u062a\u0631\u0627\u06a9\u200c\u06af\u0630\u0627\u0631\u06cc \u0644\u063a\u0648 \u0634\u062f.')
      }else{
        setMessage('\u062e\u0637\u0627 \u062f\u0631 \u06af\u0631\u0641\u062a\u0646 \u0628\u06a9\u0627\u067e: '+error.message)
      }
    }finally{
      setLoading(false)
    }
  }

  async function handleFileChange(event){
    const file=event.target.files?.[0]
    event.target.value=''

    if(!file) return

    try{
      setLoading(true)
      setMessage('\u062f\u0631 \u062d\u0627\u0644 \u0628\u0631\u0631\u0633\u06cc \u0641\u0627\u06cc\u0644...')

      const backup=await readBackupFile(file)
      const info=getBackupPreview(backup)

      setSelectedBackup(backup)
      setPreview(info)
      setMessage('\u0641\u0627\u06cc\u0644 \u0628\u06a9\u0627\u067e \u0645\u0639\u062a\u0628\u0631 \u0627\u0633\u062a.')
    }catch(error){
      setSelectedBackup(null)
      setPreview(null)
      setMessage('\u0641\u0627\u06cc\u0644 \u0645\u0639\u062a\u0628\u0631 \u0646\u06cc\u0633\u062a: '+error.message)
    }finally{
      setLoading(false)
    }
  }

  async function restoreBackup(){
    if(!store?.id||!selectedBackup) return

    const accepted=window.confirm(
      '\u0641\u0631\u0648\u0634\u06af\u0627\u0647: '+(preview?.storeName||'')+'\n'+
      '\u0645\u0634\u062a\u0631\u06cc\u200c\u0647\u0627: '+(preview?.customers||0)+'\n'+
      '\u062a\u0631\u0627\u06a9\u0646\u0634\u200c\u0647\u0627: '+(preview?.transactions||0)+'\n'+
      '\u06a9\u0627\u0631\u06a9\u0646\u0627\u0646: '+(preview?.staff||0)+'\n\n'+
      '\u0628\u0627\u0632\u06cc\u0627\u0628\u06cc \u0627\u0646\u062c\u0627\u0645 \u0634\u0648\u062f\u061f'
    )

    if(!accepted) return

    try{
      setLoading(true)
      setMessage('\u062f\u0631 \u062d\u0627\u0644 \u0628\u0627\u0632\u06cc\u0627\u0628\u06cc...')

      const result=await restoreBackupObject(
        store.id,
        selectedBackup,
        {restoreStaff:true}
      )

      setMessage(
        '\u0628\u0627\u0632\u06cc\u0627\u0628\u06cc \u0627\u0646\u062c\u0627\u0645 \u0634\u062f. '+
        result.customers+' \u0645\u0634\u062a\u0631\u06cc \u0648 '+
        result.transactions+' \u062a\u0631\u0627\u06a9\u0646\u0634.'
      )

      setSelectedBackup(null)
      setPreview(null)

      await onRestored?.()
    }catch(error){
      setMessage('\u062e\u0637\u0627 \u062f\u0631 \u0628\u0627\u0632\u06cc\u0627\u0628\u06cc: '+error.message)
    }finally{
      setLoading(false)
    }
  }

  return(
    <div className="backup-manager">
      <div className="backup-warning">
        <b>{'\u067e\u0634\u062a\u06cc\u0628\u0627\u0646\u200c\u06af\u06cc\u0631\u06cc \u0648\u0627\u0642\u0639\u06cc \u0641\u0631\u0648\u0634\u06af\u0627\u0647'}</b>
        <p>{'\u0645\u0634\u062a\u0631\u06cc\u200c\u0647\u0627\u060c \u0628\u062f\u0647\u06cc\u200c\u0647\u0627\u060c \u067e\u0631\u062f\u0627\u062e\u062a\u200c\u0647\u0627\u060c \u062a\u0627\u0631\u06cc\u062e\u0686\u0647 \u0648 \u06a9\u0627\u0631\u06a9\u0646\u0627\u0646 \u062f\u0631 \u0641\u0627\u06cc\u0644 \u0630\u062e\u06cc\u0631\u0647 \u0645\u06cc\u200c\u0634\u0648\u0646\u062f.'}</p>
      </div>

      <button
        className="backup-primary"
        onClick={createManualBackup}
        disabled={loading}
      >
        {'\ud83d\udce6 \u06af\u0631\u0641\u062a\u0646 \u0628\u06a9\u0627\u067e \u0648 \u0627\u0634\u062a\u0631\u0627\u06a9\u200c\u06af\u0630\u0627\u0631\u06cc'}
      </button>

      <button
        className="backup-secondary"
        onClick={()=>fileInputRef.current?.click()}
        disabled={loading}
      >
        {'\ud83d\udcc2 \u0627\u0646\u062a\u062e\u0627\u0628 \u0641\u0627\u06cc\u0644 \u0648 \u0628\u0627\u0632\u06cc\u0627\u0628\u06cc'}
      </button>

      <input
        ref={fileInputRef}
        className="backup-file-input"
        type="file"
        accept=".json,application/json"
        onChange={handleFileChange}
      />

      <div className="auto-backup-box">
        <label className="auto-backup-toggle">
          <input
            type="checkbox"
            checked={autoEnabled}
            onChange={e=>setAutoEnabled(e.target.checked)}
          />
          <span>{'\u0628\u06a9\u0627\u067e \u062e\u0648\u062f\u06a9\u0627\u0631'}</span>
        </label>

        <label>
          <span>{'\u0641\u0627\u0635\u0644\u0647 \u0628\u06a9\u0627\u067e'}</span>
          <select
            value={autoHours}
            onChange={e=>setAutoHours(Number(e.target.value))}
            disabled={!autoEnabled}
          >
            <option value={1}>{'\u0647\u0631 \u06cc\u06a9 \u0633\u0627\u0639\u062a'}</option>
            <option value={6}>{'\u0647\u0631 \u06f6 \u0633\u0627\u0639\u062a'}</option>
            <option value={12}>{'\u0647\u0631 \u06f1\u06f2 \u0633\u0627\u0639\u062a'}</option>
            <option value={24}>{'\u0647\u0631 \u06f2\u06f4 \u0633\u0627\u0639\u062a'}</option>
            <option value={48}>{'\u0647\u0631 \u06f4\u06f8 \u0633\u0627\u0639\u062a'}</option>
            <option value={72}>{'\u0647\u0631 \u06f7\u06f2 \u0633\u0627\u0639\u062a'}</option>
          </select>
        </label>

        <small>
          {'\u0628\u06a9\u0627\u067e \u062e\u0648\u062f\u06a9\u0627\u0631 \u0641\u0642\u0637 \u0632\u0645\u0627\u0646\u06cc \u0627\u062c\u0631\u0627 \u0645\u06cc\u200c\u0634\u0648\u062f \u06a9\u0647 \u0628\u0631\u0646\u0627\u0645\u0647 \u0628\u0627\u0632 \u0628\u0627\u0634\u062f.'}
        </small>

        {lastAutoBackup&&(
          <small>
            {'\u0622\u062e\u0631\u06cc\u0646 \u0628\u06a9\u0627\u067e \u062e\u0648\u062f\u06a9\u0627\u0631: '}
            {formatDate(Number(lastAutoBackup))}
          </small>
        )}
      </div>

      {preview&&(
        <div className="backup-preview">
          <h3>{'\u062c\u0632\u0626\u06cc\u0627\u062a \u0641\u0627\u06cc\u0644'}</h3>
          <div><span>{'\u0641\u0631\u0648\u0634\u06af\u0627\u0647'}</span><b>{preview.storeName}</b></div>
          <div><span>{'\u062a\u0627\u0631\u06cc\u062e'}</span><b>{formatDate(preview.createdAt)}</b></div>
          <div><span>{'\u0645\u0634\u062a\u0631\u06cc\u200c\u0647\u0627'}</span><b>{preview.customers}</b></div>
          <div><span>{'\u062a\u0631\u0627\u06a9\u0646\u0634\u200c\u0647\u0627'}</span><b>{preview.transactions}</b></div>
          <div><span>{'\u06a9\u0627\u0631\u06a9\u0646\u0627\u0646'}</span><b>{preview.staff}</b></div>

          <button className="backup-restore" onClick={restoreBackup}>
            {'\u062a\u0623\u06cc\u06cc\u062f \u0648 \u0628\u0627\u0632\u06cc\u0627\u0628\u06cc'}
          </button>
        </div>
      )}

      {message&&<div className="backup-message">{message}</div>}
    </div>
  )
}

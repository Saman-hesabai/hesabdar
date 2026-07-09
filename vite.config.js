import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
export default defineConfig({plugins:[react(),VitePWA({registerType:'autoUpdate',manifest:{name:'Hesabdar',short_name:'Hesabdar',description:'Smart credit accounting app',theme_color:'#2563eb',background_color:'#f8fafc',display:'standalone',dir:'rtl',lang:'fa',start_url:'/',icons:[]}})]})

"use client";
import {createContext,useContext,useState} from 'react';
import {useI18n} from '../../i18n';
import {SettingsDraftProvider,useDraftRegistration} from '../../settings/SettingsDrafts';
import styles from './SettingsFrame.module.css';
const Preferences=createContext(null);
export function useSettingsPreferences(){return useContext(Preferences);}
function PreferencesProvider({initialSettings,children}){
 const {isArabic}=useI18n();
 const [saved,setSaved]=useState(initialSettings),[draft,setDraft]=useState(initialSettings),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState('');
 const dirty=JSON.stringify(saved)!==JSON.stringify(draft);
 useDraftRegistration({id:'dashboard-ui',label:isArabic?'إعدادات الواجهة':'UI preferences',dirty,saving:busy,discard:()=>{setDraft(saved);setNotice('');setError('');}});
 return <Preferences.Provider value={{saved,setSaved,draft,setDraft,busy,setBusy,notice,setNotice,error,setError,dirty}}>{children}</Preferences.Provider>;
}
export default function SettingsFrame({initialSettings,children}){return <SettingsDraftProvider><PreferencesProvider initialSettings={initialSettings}><div className={styles.frame} data-settings-frame><div className={styles.content} data-settings-page-content>{children}</div></div></PreferencesProvider></SettingsDraftProvider>;}

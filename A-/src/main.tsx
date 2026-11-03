import React from 'react';
import {createRoot} from 'react-dom/client';
import Radar from './app/radar';
import './app/globals.css';
import {loadSnapshot} from './lib/client-request';
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
void loadSnapshot().then(initialData=>{createRoot(document.getElementById('root')!).render(<React.StrictMode><Radar initialData={initialData} initialToday={today}/></React.StrictMode>);});

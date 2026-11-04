export const DATA_ROUTE_KEY='obsidian-data-route-v2';
export const PUBLIC_DEFAULTS_KEY='obsidian-public-defaults-v1';
type Read=(key:string)=>string|null;
function readJSON(read:Read,key:string):unknown{try{return JSON.parse(read(key)||'null');}catch{return null;}}
/** New devices, old route settings and blocked storage all start with the independent route. */
export function getDataRoute(read:Read=()=>null):'public'|'auto'{return readJSON(read,DATA_ROUTE_KEY)==='auto'?'auto':'public';}
export function getRefreshPreferences(read:Read=()=>null){
 if(readJSON(read,PUBLIC_DEFAULTS_KEY)!==true)return {auto:true,intervalSec:5};
 const auto=readJSON(read,'obsidian-auto'),seconds=readJSON(read,'obsidian-interval');
 return {auto:typeof auto==='boolean'?auto:true,intervalSec:typeof seconds==='number'&&[5,10,30,60,300].includes(seconds)?seconds:5};
}

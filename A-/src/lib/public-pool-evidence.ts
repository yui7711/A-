import {num} from './market-core.ts';
import type {PoolObservation} from './market-types.ts';

type Row={c?:unknown;ltsz?:unknown;lbt?:unknown};
type Pool={qdate?:unknown;tc?:unknown;pool?:Row[]|null};
const code=(row:Row)=>String(row.c??'');

export function validatedPool(value:unknown,day:string){
 const pool=value as Pool|null|undefined;
 if(String(pool?.qdate).replaceAll('-','')!==day)return null;
 const total=num(pool?.tc);
 if(total===0&&(pool?.pool==null||pool.pool.length===0))return [];
 const rows=pool?.pool;
 if(!Array.isArray(rows)||total!==rows.length||rows.some(r=>!r||!/^\d{6}$/.test(code(r)))
  ||new Set(rows.map(code)).size!==rows.length)return null;
 return rows;
}

export function poolObservation(date:string,up:unknown,broken:unknown,down:unknown):PoolObservation{
 const day=date.replaceAll('-','');
 const rows=validatedPool(up,day);
 return {
  limitUp:rows?Object.fromEntries(rows.map(r=>[code(r),num(r.ltsz)])):null,
  broken:validatedPool(broken,day)?.map(code)??null,down:validatedPool(down,day)?.map(code)??null,
  lastSeal:Object.fromEntries((rows||[]).flatMap(r=>{
   const v=String(r.lbt??'').padStart(6,'0');
   if(!/^(09|1[0-5])[0-5]\d[0-5]\d$/.test(v))return [];
   return [[code(r),Number(v.slice(0,2))*60+Number(v.slice(2,4))]];
  })),
 };
}

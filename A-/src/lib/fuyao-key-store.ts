export const FUYAO_DEVICE_KEY='obsidian-fuyao-device-key-v1';
export const validFuyaoKey=(value:unknown):value is string=>typeof value==='string'&&/^sk-fuyao-[\w-]{16,}$/.test(value);
type StorageLike=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
export function createDeviceKeyStore(storage:StorageLike){return {
 read(){try{const key=storage.getItem(FUYAO_DEVICE_KEY);return validFuyaoKey(key)?key:null;}catch{return null;}},
 save(key:string){if(!validFuyaoKey(key))throw Error('密钥格式不完整');try{storage.setItem(FUYAO_DEVICE_KEY,key);}catch{throw Error('浏览器禁止保存；当前连接可用，但下次需要重新输入。');}},
 clear(){try{storage.removeItem(FUYAO_DEVICE_KEY);}catch{throw Error('浏览器禁止清除存储，请在浏览器站点设置中清除本网站数据。');}}
};}

// The key sailing roads, measured: days, made-good speed, share of the road within 55° of the wind.
// npx esbuild scripts/routes.ts --bundle --platform=node --format=cjs --outfile=/tmp/routes.cjs && node /tmp/routes.cjs [hullId]
// Rows marked * are roads that should be hard.
import { prevailingWind } from '../src/world/wind';
import { currentAt } from '../src/world/currents';
import { polarAt } from '../src/ship/polars';
type P = {lat:number, lon:number};
const R: {name:string, pts:P[], months:number[], expect:'fair'|'hard'}[] = [
  {name:'Lisbon→Canaries', pts:[{lat:38.5,lon:-9.6},{lat:33,lon:-13},{lat:28.5,lon:-15.3}], months:[1,4,7,10], expect:'fair'},
  {name:'Canaries→Serra Leoa', pts:[{lat:28,lon:-16},{lat:20,lon:-19},{lat:14,lon:-19},{lat:8.5,lon:-13.8}], months:[1,4,7,10], expect:'fair'},
  {name:'Serra Leoa→Mina (coast)', pts:[{lat:7.5,lon:-13.5},{lat:4.3,lon:-8},{lat:4.4,lon:-4},{lat:4.9,lon:-1.4}], months:[1,4,7,10], expect:'fair'},
  {name:'Mina→São Tomé→Mpinda', pts:[{lat:4.5,lon:-1},{lat:0.5,lon:6.5},{lat:-3,lon:10},{lat:-6.1,lon:12.2}], months:[1,4,7,10], expect:'fair'},
  {name:'Mina→home by the volta', pts:[{lat:4,lon:-2},{lat:-1,lon:-1},{lat:-1,lon:-14},{lat:12,lon:-26},{lat:25,lon:-34},{lat:36,lon:-30},{lat:38.5,lon:-12}], months:[1,4,7,10], expect:'fair'},
  {name:'Mina→home up the coast (should be hard)', pts:[{lat:5,lon:-5},{lat:10,lon:-16},{lat:21,lon:-17.5},{lat:30,lon:-11},{lat:38.5,lon:-9.8}], months:[1,7], expect:'hard'},
  {name:'Lisbon→the line (Cape road)', pts:[{lat:38.5,lon:-10},{lat:28,lon:-17},{lat:15,lon:-24},{lat:5,lon:-24},{lat:0,lon:-26}], months:[3,4,5], expect:'fair'},
  {name:'The line→Brazil→westerlies→Cape', pts:[{lat:0,lon:-26},{lat:-15,lon:-31},{lat:-28,lon:-30},{lat:-37,lon:-20},{lat:-38,lon:0},{lat:-35.5,lon:18}], months:[5,6,7], expect:'fair'},
  {name:'The line→Cape hugging Africa (should be hard)', pts:[{lat:0,lon:5},{lat:-12,lon:11},{lat:-24,lon:13},{lat:-34,lon:17.5}], months:[1,7], expect:'hard'},
  {name:'Cape→Moçambique', pts:[{lat:-35.5,lon:19},{lat:-37,lon:26},{lat:-31,lon:35},{lat:-24,lon:37},{lat:-15,lon:41}], months:[7,8], expect:'fair'},
  {name:'Cape→Moçambique close in, summer (should be hard)', pts:[{lat:-35.5,lon:19},{lat:-35,lon:26},{lat:-31,lon:32},{lat:-24,lon:37},{lat:-15,lon:41}], months:[1], expect:'hard'},
  {name:'Cape→Moçambique wide, summer', pts:[{lat:-35.5,lon:19},{lat:-40,lon:24},{lat:-39,lon:33},{lat:-30,lon:40},{lat:-24,lon:40},{lat:-15,lon:41}], months:[1], expect:'fair'},
  {name:'Moçambique→Melinde', pts:[{lat:-15,lon:41},{lat:-10,lon:41.5},{lat:-4.5,lon:40},{lat:-3.2,lon:40.3}], months:[3,4,8], expect:'fair'},
  {name:'Melinde→Calecute (SW monsoon)', pts:[{lat:-3.2,lon:40.5},{lat:2,lon:52},{lat:8,lon:65},{lat:11.3,lon:75.4}], months:[5,8], expect:'fair'},
  {name:'Melinde→Calecute in the NE monsoon (should be hard)', pts:[{lat:-3.2,lon:40.5},{lat:2,lon:52},{lat:8,lon:65},{lat:11.3,lon:75.4}], months:[1], expect:'hard'},
  {name:'Calecute→Melinde (NE monsoon)', pts:[{lat:11.3,lon:75},{lat:8,lon:65},{lat:2,lon:52},{lat:-3.2,lon:40.5}], months:[12,1], expect:'fair'},
  {name:'Moçambique→round the Cape westward', pts:[{lat:-15,lon:41},{lat:-24,lon:36},{lat:-31,lon:32},{lat:-35,lon:24},{lat:-35,lon:17}], months:[2,3,4], expect:'fair'},
  {name:'Cape→St Helena→the line', pts:[{lat:-34.5,lon:17},{lat:-25,lon:2},{lat:-16,lon:-6},{lat:-8,lon:-14},{lat:0,lon:-22}], months:[1,4,7,10], expect:'fair'},
  {name:'The line→home by the Azores', pts:[{lat:0,lon:-22},{lat:15,lon:-31},{lat:30,lon:-37},{lat:38,lon:-28},{lat:38.5,lon:-10}], months:[1,4,7,10], expect:'fair'},
];
const brg=(a:P,b:P)=>{const dy=b.lat-a.lat, dx=(b.lon-a.lon)*Math.cos(a.lat*Math.PI/180); return (Math.atan2(dx,dy)*180/Math.PI+360)%360;};
const nm=(a:P,b:P)=>{const dy=b.lat-a.lat, dx=(b.lon-a.lon)*Math.cos((a.lat+b.lat)/2*Math.PI/180); return Math.hypot(dx,dy)*60;};
const hull = process.argv[2] ?? 'caravela-redonda';
for (const r of R) for (const m of r.months) {
  const doy = Math.round((m-1)*30.4+15);
  let days=0, foulNm=0, total=0, calmNm=0; const notes:string[]=[];
  for (let i=0;i<r.pts.length-1;i++){
    const a=r.pts[i], b=r.pts[i+1], c=brg(a,b), d=nm(a,b); const steps=Math.max(2,Math.round(d/60)); const d0=days;
    for (let k=0;k<steps;k++){
      const p={lat:a.lat+(b.lat-a.lat)*(k+0.5)/steps, lon:a.lon+(b.lon-a.lon)*(k+0.5)/steps}; const seg=d/steps;
      let vSum=0; let offSum=0; let spdSum=0; const N=12;
      for (let j=0;j<N;j++){ const w=prevailingWind(p,doy,1e9+j*3600*29);
        let best=0; for (let h=-90; h<=90; h+=5){ const head=c+h; const twa=Math.abs((((w.from-head)%360)+540)%360-180); const v=polarAt(hull,w.speed,twa)*Math.cos(h*Math.PI/180)*(twa<75?0.7:1)*(Math.abs(h)>25?0.9:1); if(v>best) best=v; }
        const cur=currentAt(p,doy); const along=cur.knots*Math.cos((cur.toward-c)*Math.PI/180);
        vSum += Math.max(0.3, best+along); offSum += Math.abs((((w.from-c)%360)+540)%360-180); spdSum+=w.speed; }
      const v=vSum/N, off=offSum/N;
      days += seg/(v*24); total+=seg; if (off<55) foulNm+=seg; if (spdSum/N<5) calmNm+=seg;
    }
    if (process.env.LEGS) console.log(`     leg ${i} course ${c.toFixed(0)} ${d.toFixed(0)}nm ${(days-d0).toFixed(1)}d`);
  }
  const straight = total/(4*24);
  if (process.env.LEGS) {}
  console.log(`${r.expect==='hard'?'*':' '} ${r.name.padEnd(48)} m${String(m).padStart(2)} ${String(Math.round(total)).padStart(5)}nm ${days.toFixed(0).padStart(4)}d (${(total/days/24).toFixed(1)}kn made good) foul ${Math.round(foulNm/total*100)}% calm ${Math.round(calmNm/total*100)}%`);
}

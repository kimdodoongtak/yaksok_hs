export function heatLevel(count:number,total:number){return count>0?Math.ceil(count/Math.max(1,total)*4):0;}
export function heatLegend(total:number):{level:number;label:string}[]{
  const groups=new Map<number,number[]>();
  for(let count=1;count<=total;count++){
    const level=heatLevel(count,total),counts=groups.get(level)??[];
    counts.push(count);groups.set(level,counts);
  }
  return [...groups].map(([level,counts])=>({level,label:counts.length===1?`${counts[0]}명`:`${counts[0]}~${counts.at(-1)}명`}));
}

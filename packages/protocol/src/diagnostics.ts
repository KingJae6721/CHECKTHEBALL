// Fixed-capacity samples; percentile work is done only when reading diagnostics.
export class Samples{
 private values:Float64Array;private cursor=0;private count=0;
 constructor(capacity=256){this.values=new Float64Array(capacity);}
 add(value:number){if(!Number.isFinite(value)||value<0)return;this.values[this.cursor]=value;this.cursor=(this.cursor+1)%this.values.length;this.count=Math.min(this.count+1,this.values.length);}
 summary(){const a=Array.from(this.values.subarray(0,this.count)).sort((a,b)=>a-b);const q=(p:number)=>a.length?a[Math.floor((a.length-1)*p)]:null;return {count:a.length,p50:q(.5),p95:q(.95),max:a.at(-1)??null};}
 clear(){this.cursor=0;this.count=0;}
}

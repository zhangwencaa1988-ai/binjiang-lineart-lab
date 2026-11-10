// Local edge extraction only. This module does not run an AI or ControlNet model.
export function canny(rgba, width, height, options = {}) {
  const w=width,h=height,n=w*h;
  if(!Number.isInteger(w)||!Number.isInteger(h)||w<3||h<3||rgba.length!==n*4) throw new Error('图片尺寸不正确');
  const threshold=Math.max(12,Math.min(110,Number(options.threshold)||42));
  const smooth=Math.max(0,Math.min(3,Math.round(Number(options.smooth) || 0)));
  const thickness=Math.max(0,Math.min(2,Math.round(Number(options.thickness)||0)));
  let gray=new Float32Array(n);
  for(let i=0;i<n;i++){const j=i*4,a=rgba[j+3]/255;gray[i]=(.299*rgba[j]+.587*rgba[j+1]+.114*rgba[j+2])*a+255*(1-a);}
  // Clamp the image at its borders; zero padding would create a false frame.
  for(let pass=0;pass<smooth;pass++){
    const temp=new Float32Array(n),blur=new Float32Array(n);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;temp[i]=(gray[y*w+Math.max(0,x-1)]+2*gray[i]+gray[y*w+Math.min(w-1,x+1)])/4;}
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;blur[i]=(temp[Math.max(0,y-1)*w+x]+2*temp[i]+temp[Math.min(h-1,y+1)*w+x])/4;}
    gray=blur;
  }
  const gx=new Float32Array(n),gy=new Float32Array(n),mag=new Float32Array(n),nms=new Float32Array(n);
  for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
    const i=y*w+x,a=gray[i-w-1],b=gray[i-w],c=gray[i-w+1],d=gray[i-1],e=gray[i+1],f=gray[i+w-1],g=gray[i+w],j=gray[i+w+1];
    gx[i]=-a+c-2*d+2*e-f+j;gy[i]=-a-2*b-c+f+2*g+j;mag[i]=Math.hypot(gx[i],gy[i]);
  }
  for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
    const i=y*w+x,m=mag[i];if(m===0)continue;
    let angle=Math.atan2(gy[i],gx[i])*180/Math.PI;if(angle<0)angle+=180;
    let a,b;
    if(angle<22.5||angle>=157.5){a=mag[i-1];b=mag[i+1];}
    else if(angle<67.5){a=mag[i-w-1];b=mag[i+w+1];}
    else if(angle<112.5){a=mag[i-w];b=mag[i+w];}
    else{a=mag[i-w+1];b=mag[i+w-1];}
    if(m>=a&&m>=b)nms[i]=m;
  }
  const high=threshold*2.2,low=high*.42,state=new Uint8Array(n),stack=new Int32Array(n);let top=0;
  for(let i=0;i<n;i++)if(nms[i]>=high){state[i]=2;stack[top++]=i;}else if(nms[i]>=low)state[i]=1;
  while(top){const i=stack[--top],x=i%w,y=Math.floor(i/w);for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
    if(dx===0&&dy===0)continue;const nx=x+dx,ny=y+dy;if(nx<1||nx>=w-1||ny<1||ny>=h-1)continue;
    const j=ny*w+nx;if(state[j]===1){state[j]=2;stack[top++]=j;}
  }}
  const out=new Uint8ClampedArray(n*4);let edgePixels=0;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=y*w+x;let edge=state[i]===2;
    if(!edge&&thickness)outer:for(let dy=-thickness;dy<=thickness;dy++)for(let dx=-thickness;dx<=thickness;dx++){
      const xx=x+dx,yy=y+dy;if(xx>=0&&xx<w&&yy>=0&&yy<h&&state[yy*w+xx]===2){edge=true;break outer;}
    }
    const j=i*4,v=edge?0:255;out[j]=out[j+1]=out[j+2]=v;out[j+3]=255;if(edge)edgePixels++;
  }
  return {pixels:out,edgePixels,width:w,height:h};
}

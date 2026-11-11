import {canny} from './edge.js';
self.onmessage=({data})=>{try{const result=canny(new Uint8ClampedArray(data.rgba),data.width,data.height,data.options);self.postMessage({id:data.id,...result},[result.pixels.buffer]);}catch(error){self.postMessage({id:data.id,error:error.message});}};

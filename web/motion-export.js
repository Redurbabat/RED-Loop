/**
 * Encode a PNG with a bounded wait: some browsers can fail to deliver a
 * toBlob callback during resource pressure, navigation, or canvas loss.
 * Late or duplicate callbacks never settle the promise a second time.
 */
export function encodeCanvasPng(canvas,timeoutMs=12000){
  return new Promise((resolve,reject)=>{
    if(!canvas||typeof canvas.toBlob!=='function'){
      reject(new Error('PNG conversion is not supported'));
      return;
    }
    let settled=false;
    const finish=(error,blob)=>{
      if(settled)return;
      settled=true;
      clearTimeout(timer);
      if(error)reject(error);
      else resolve(blob);
    };
    const timer=setTimeout(()=>finish(new Error('PNG conversion timed out')),timeoutMs);
    try{
      canvas.toBlob(blob=>{
        if(!blob){finish(new Error('PNG conversion returned no image'));return;}
        if(blob.type&&blob.type!=='image/png'){
          finish(new Error('PNG conversion returned an unexpected image format'));
          return;
        }
        finish(null,blob);
      },'image/png');
    }catch(error){finish(error);}
  });
}

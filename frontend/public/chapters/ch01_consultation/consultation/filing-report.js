'use strict';
let current=null;
function fitValues(){
  for(const el of document.querySelectorAll('.filing-value')){
    const initial=parseFloat(el.style.getPropertyValue('--field-font'));
    let size=initial;el.style.fontSize=size+'cqw';
    while((el.scrollHeight>el.clientHeight+1 || el.scrollWidth>el.clientWidth+1)&&size>.4){size-=.025;el.style.fontSize=size+'cqw';}
  }
}
window.addEventListener('message',async event=>{
  if(event.origin!==location.origin || event.source!==parent || !event.data) return;
  if(event.data.type==='taxflow:filing-data'){
    current=filingModel.build(event.data.data);
    document.querySelector('#filing-pages').innerHTML=filingRender.render(current);
    document.title=`${current.values.taxpayerName || '납세자'} 양도소득세 신고서`;
    await document.fonts.ready;requestAnimationFrame(fitValues);
  }
  if(event.data.type==='taxflow:filing-print' && current){
    try {
      await Promise.all([...document.images].map(img=>img.decode()));await document.fonts.ready;
      fitValues();window.print();
    } catch(e){ parent.postMessage({type:'taxflow:filing-error',message:'서식 이미지를 불러오지 못했습니다. 화면을 새로 고친 뒤 다시 출력하세요.'},location.origin); }
  }
});
parent.postMessage({type:'taxflow:filing-ready'},location.origin);

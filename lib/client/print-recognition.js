let printing=false;
export async function printRecognitionArtwork(kind) {
  if(printing)return;
  printing=true;
  const cleanup=()=>{delete document.body.dataset.recognitionPrint;window.removeEventListener("afterprint",cleanup);printing=false;};
  try {
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const artwork=document.querySelector(`.recognition-preview [data-recognition-kind="${kind}"]`);
    if(!artwork)throw new Error("Open the award preview before printing.");
    await document.fonts.ready;
    await Promise.all([...artwork.querySelectorAll("img")].map(image=>image.decode().catch(()=>{})));
    document.body.dataset.recognitionPrint=kind;
    window.addEventListener("afterprint",cleanup);
    window.print();
  } catch(error) {cleanup();throw error;}
}

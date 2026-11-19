async function dataUrlToBlob(dataUrl){const resp=await fetch(dataUrl);return await resp.blob()}

// Stage 30: self-contained bounded snapshot history for illustration annotations.
// No DOM, IndexedDB, network, images or editor state are captured.
function stage30CreatePhotoHistory(initialShapes,maxEntries=60){
  const cap=Number.isInteger(maxEntries)?Math.max(10,Math.min(maxEntries,150)):60;
  const serialize=value=>JSON.stringify(Array.isArray(value)?value:[]);
  const initial=serialize(initialShapes);
  let stack=[initial],index=0;
  return {
    record(shapes){
      const item=serialize(shapes);
      if(item===stack[index])return false;
      stack=stack.slice(0,index+1);
      stack.push(item);
      index=stack.length-1;
      if(stack.length>cap){
        stack.shift();
        index=stack.length-1;
      }
      return true;
    },
    undo(){
      if(index<=0)return null;
      index--;
      return JSON.parse(stack[index]);
    },
    redo(){
      if(index>=stack.length-1)return null;
      index++;
      return JSON.parse(stack[index]);
    },
    canUndo(){return index>0},
    canRedo(){return index<stack.length-1},
    dirty(shapes){return serialize(shapes)!==initial},
    current(){return JSON.parse(stack[index])},
    length(){return stack.length}
  };
}

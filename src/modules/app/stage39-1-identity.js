// Stage39.1: clearly identify the audit fixes without changing Stage39 UI layout.
const stage391PreviousRenderSteps=renderSteps;
renderSteps=function stage391RenderSteps(){
  stage391PreviousRenderSteps();
  const label=document.getElementById('sopVersionLabel');
  if(label){
    label.textContent='· Stage39.1 (проверка)';
    label.title='Совместимость подсказок ИИ, причин СОП, чек-листа и Анализа ФРВ с Stage38';
  }
};

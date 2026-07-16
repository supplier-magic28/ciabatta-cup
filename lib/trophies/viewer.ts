export function trophyViewerControls({loaded,failed,canActivateAr,androidAr}:{loaded:boolean;failed:boolean;canActivateAr:boolean;androidAr:boolean}){
  return {showArButton:loaded&&!failed&&androidAr&&canActivateAr,showArUnavailable:loaded&&!failed&&(!androidAr||!canActivateAr)};
}

export function shouldAutoRotateTrophy(reducedMotion:boolean){return !reducedMotion}

export function arFailureHint(status:string){
  return status==="failed"?"AR could not start. Check camera access and Google Play Services for AR, then try again.":null;
}

export function trophyViewerControls({loaded,failed,canActivateAr,androidAr,androidCandidate=false}:{loaded:boolean;failed:boolean;canActivateAr:boolean;androidAr:boolean;androidCandidate?:boolean}){
  const canOfferPlacement=androidAr&&(canActivateAr||androidCandidate);
  return {showArButton:loaded&&!failed&&canOfferPlacement,showArUnavailable:loaded&&!failed&&!canOfferPlacement};
}

export function isAndroidArCandidate(userAgent:string){return /android/i.test(userAgent)}

export function androidSceneViewerIntent(modelUrl:string,fallbackUrl:string){
  const file=encodeURIComponent(new URL(modelUrl,fallbackUrl).toString());
  const fallback=encodeURIComponent(fallbackUrl);
  return `intent://arvr.google.com/scene-viewer/1.2?mode=ar_preferred&file=${file}#Intent;scheme=https;package=com.google.android.googlequicksearchbox;action=android.intent.action.VIEW;S.browser_fallback_url=${fallback};end;`;
}

export function shouldAutoRotateTrophy(reducedMotion:boolean){return !reducedMotion}

export function arFailureHint(status:string){
  return status==="failed"?"AR could not start. Check camera access and Google Play Services for AR, then try again.":null;
}

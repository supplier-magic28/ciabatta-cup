"use client";

import "@google/model-viewer";
import { createElement, useCallback, useEffect, useState } from "react";
import type { TrophyAssetDefinition } from "@/lib/trophies/assets";
import { arFailureHint, shouldAutoRotateTrophy, trophyViewerControls } from "@/lib/trophies/viewer";
import styles from "./TrophyViewer.module.css";

type ModelViewerElement = HTMLElement & { loaded:boolean;canActivateAR:boolean;activateAR:()=>Promise<void> };

export function TrophyModelStage({asset,trophyName}:{asset:TrophyAssetDefinition;trophyName:string}){
  const [element,setElement]=useState<ModelViewerElement|null>(null);
  const [loaded,setLoaded]=useState(false);
  const [failed,setFailed]=useState(false);
  const [canActivateAr,setCanActivateAr]=useState(false);
  const [arMessage,setArMessage]=useState("");
  const [reducedMotion,setReducedMotion]=useState(false);
  const modelRef=useCallback((node:Element|null)=>setElement(node as ModelViewerElement|null),[]);

  useEffect(()=>{const query=window.matchMedia("(prefers-reduced-motion: reduce)");const update=()=>setReducedMotion(query.matches);update();query.addEventListener("change",update);return()=>query.removeEventListener("change",update)},[]);
  useEffect(()=>{
    if(!element)return;
    const onLoad=()=>{setLoaded(true);setFailed(false);setCanActivateAr(asset.androidAr&&Boolean(element.canActivateAR))};
    const onError=()=>{setFailed(true);setLoaded(false)};
    const onArStatus=(event:Event)=>{const message=arFailureHint((event as CustomEvent<{status:string}>).detail.status);if(message)setArMessage(message)};
    element.addEventListener("load",onLoad);element.addEventListener("error",onError);element.addEventListener("ar-status",onArStatus);
    if(element.loaded)onLoad();
    return()=>{element.removeEventListener("load",onLoad);element.removeEventListener("error",onError);element.removeEventListener("ar-status",onArStatus)};
  },[asset.androidAr,element]);

  const activateAr=()=>{
    if(!element)return;
    setArMessage("");
    void element.activateAR().catch(()=>setArMessage("Camera access is needed to place this trophy. You can keep exploring it here."));
  };

  const controls=trophyViewerControls({loaded,failed,canActivateAr,androidAr:asset.androidAr});
  return <div className={styles.modelStage}>
    {createElement("model-viewer",{
      ref:modelRef,
      src:asset.modelSrc,poster:asset.posterSrc,alt:`Interactive 3D model of ${trophyName}`,
      ar:"", "ar-modes":"webxr scene-viewer", "camera-controls":"", "touch-action":"pan-y",
      "shadow-intensity":"1", "shadow-softness":"0.75", exposure:"1.05",
      "auto-rotate":shouldAutoRotateTrophy(reducedMotion)?"":undefined, "rotation-per-second":"30deg",
      loading:"eager",reveal:"auto",className:styles.model,
    })}
    {!loaded&&!failed&&<p className={styles.modelStatus} role="status">Polishing the trophy…</p>}
    {failed&&<div className={styles.modelError} role="alert"><b>Couldn’t load the 3D trophy.</b><span>The poster remains available; try again when your connection improves.</span></div>}
    <p className={styles.gestureHint}>{reducedMotion?"Drag to inspect · pinch to zoom":"Slow rotation · drag to inspect · pinch to zoom"}</p>
    {controls.showArButton&&<button type="button" onClick={activateAr} className={styles.arButton}>Place in your space</button>}
    {controls.showArUnavailable&&<p className={styles.arUnavailable}>3D viewer · Android AR appears here on supported devices</p>}
    {arMessage&&<p className={styles.arMessage} role="status">{arMessage}</p>}
  </div>;
}

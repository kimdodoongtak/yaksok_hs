"use client";

import { useId, useState, type ReactNode } from "react";
import styles from "./availability.module.css";

export function EditButton({label,description,disabled,onClick,children}:{label:string;description:string;disabled:boolean;onClick:()=>void;children:ReactNode}) {
  const id=useId();
  const [visible,setVisible]=useState(false);
  return <span className={styles.editAction}
    onPointerEnter={()=>setVisible(true)} onPointerLeave={()=>setVisible(false)}
    onFocus={()=>setVisible(true)} onBlur={()=>setVisible(false)}
    onKeyDown={event=>{if(event.key==="Escape")setVisible(false);}}>
    <button type="button" aria-label={label} aria-describedby={visible?id:undefined} disabled={disabled} onClick={onClick}>
      {children}
    </button>
    {visible && <span id={id} role="tooltip" className={styles.tooltip}>{description}</span>}
  </span>;
}

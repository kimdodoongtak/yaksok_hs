import { notFound } from "next/navigation";
import { ConfirmationPreview } from "@/components/confirmation/confirmation-preview";
export default function Page(){
  if(process.env.NODE_ENV!=="development")notFound();
  return <ConfirmationPreview/>;
}

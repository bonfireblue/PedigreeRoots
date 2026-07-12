export const dynamic = "force-dynamic";

import { Suspense } from "react";
import AcceptInviteClient from "./AcceptInviteClient";

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={
      <div style={{ 
        minHeight: "100vh", 
        display: "flex", 
        alignItems: "center", 
        justifyContent: "center",
        opacity: 0.6 
      }}>
        Loading...
      </div>
    }>
      <AcceptInviteClient />
    </Suspense>
  );
}

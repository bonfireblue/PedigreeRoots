# PedigreeRoots Invite Flow & Acceptance Audit
*Completed: April 10, 2026*

This report details the findings from testing the "Invite" action on `pedigreeroots.com`, including dispatching both Email and SMS invites and executing the post-invitation acceptance/claim flow.

---

## ✉️ 1. Sending the Invitation

### **Email Send Test**
* **Result:** **Success.** Sent a test invite to a Mailinator inbox (`pedigreetest_99@mailinator.com`). The email arrived immediately with the correct link structure.
* **UI Bug:** After clicking "Send", the button switches to a loading state and successfully displays a green `< ✓ Invitation sent! >` confirmation. However, the Send button itself remains functionally disabled and visually dimmed, forcing the user to close the panel if they wanted to send another invite to someone else.

### **SMS Send Test**
* **Result:** **Success.** Used a dummy US number (`+14155552671`) and the UI displayed the proper success confirmation.

---

## 🔗 2. Post-Acceptance Interface (The Invitee Experience) 

After receiving the email, I clicked the `accept-invite` link. The system recognized my active session and prompted me to claim the node ("Trang Nguyen"). 

### 🐞 Critical Bug: Self-Locking Profile (Highest Priority)
* **What Happened:** Once you click "Claim This Profile", you become the "manager" of that node. However, when you click on your newly claimed profile node in the family tree, the side-drawer completely locks down. 
* **The Error:** The form inputs disappear and are replaced by a static text box stating: *"This profile is managed by the person who claimed it."* 
* **Impact:** The person who just claimed their profile is treated as a guest and is completely barred from editing their own Name, Gender, Dates, or Bio. 

### 🎨 UX Issue: Silent Success State
* **What Happened:** After hitting "Claim This Profile", you are instantly redirected back to the `/pedigree` canvas. 
* **The Error:** There is absolutely no success toast, popup, or confirmation message stating that the claim was successful. The only visual change is a small green "Claimed" badge on the node, leaving the user wondering if the action actually went through.

### ⚠️ Business Logic Flaw: Multiple Claims per User
* **What Happened:** The system allowed my existing logged-in user account ("Bon Huynh") to accept an invite and claim the profile for a completely different node ("Trang Nguyen").
* **The Error:** A user should generally only be mapped to exactly one `Person` node per family tree to represent "themselves". There was no warning or block preventing a single user account from claiming multiple profile nodes in the same tree.

# PedigreeRoots Invitee Permissions Audit
*Completed: April 10, 2026*

This report details the findings from testing the permissions and capabilities of a new user ("invitee") who joined an existing family tree via a shared invitation link on `pedigreeroots.com`, tracking parity with the original tree creator across Desktop and Mobile views.

---

## 🔑 Permissions Parity: Invitee vs. Creator

**Conclusion:** The invitee has **exact functional parity** with the original tree creator for managing the family tree structure. 

Here is what the newly joined invitee is permitted to do:

### 1. Add New Nodes & Detailed Information (✅ FULL ACCESS)
* **Testing:** As the new invitee, I was able to successfully create new family nodes (such as adding new siblings to the tree). 
* **Editing:** After creating a node, I retained full permission to open the profile and save detailed biographical information, including First Name, Last Name, Gender, Birthdate, "Grew up in" location, and their bio/story.
* **Result:** Passed perfectly on both Desktop (1200x800) and Mobile (390x844).

### 2. Modifying Existing Unclaimed Profiles (✅ FULL ACCESS)
* **Testing:** The invitee can open profiles created by the original creator (or anyone else) that have *not yet been claimed*. 
* **Result:** I successfully changed the name of "Chau Tat" to "Chau Edit" and saved without encountering any permission or server barriers, just as the original creator could.

### 3. Deleting Nodes (✅ FULL ACCESS)
* **Testing:** The invitee can open the "Relationships" tab of an unclaimed person and permanently delete them from the tree.
* **Result:** The system allowed the deletion of nodes (like "Test Sibling" and "Mobile Sibling") to go through flawlessly.

### 4. Inviting Other People (✅ FULL ACCESS)
* **Testing:** The invitee is fully empowered to help grow the network. They can click "Invite to claim this profile" on any unclaimed node, generate an invite link, and securely copy it to their clipboard.

---

## 🔒 Privacy Controls & Restrictions

### Editing Claimed Profiles (✅ EXPECTED RESTRICTION)
* **Testing:** I attempted to edit the node of "Bon Huynh", who was the original tree creator and had already *claimed* their own node.
* **Result:** **Successfully Restricted.** The editing inputs for First/Last Name, Dates, and Bio correctly disappeared. The UI appropriately displayed the lock-out message: *"This profile is managed by the person who claimed it."* This respects the strict data privacy of claimed accounts, preventing the invitee from hijacking or defacing someone else's personal node.

---

## 📱 Mobile vs. Desktop Experience
* Features dynamically responded and functioned well in the narrower Mobile bottom-sheet layout (e.g., node selection, bottom-sheet profile modifications, relationship additions, and zoom/pan functionality). 
* No actions were cut off or hindered during testing solely because of viewport size.

# PedigreeRoots Pre-Launch Final Audit
*Completed: April 13, 2026*

This is the final, comprehensive end-to-end check of `pedigreeroots.com` to identify any remaining bugs, UX edge cases, and design flaws before the official public launch.

---

## 🛑 High Priority (Must Fix Before Launch)

### 1. The Self-Locking Bug Re-Emerges
* **Issue:** While we previously confirmed a fix for new invitees, the issue seems to persist for legacy or older claimed nodes. When signed in as the original creator "Bon Huynh" and clicking on the corresponding "Bon Huynh" profile node, the profile editing panel is completely locked. It incorrectly displays the read-only *"This profile is managed by the person who claimed it"* message instead of the input fields. 

### 2. Add Person Form Localization Gaps 
* **Issue:** When the website is toggled to Vietnamese (`VI`), significant portions of the core data entry forms remain stubbornly in English. 
* **Specifically:** Inside the "Add Person" / "Relationships" panel, the inputs for `First name`, `Last name`, `Birth Date` format (`mm/dd/yyyy`), and the main `ADD RELATION` submit buttons ignore the language state.

---

## 🟡 Medium Priority (UX & Functionality)

### 1. "Switch Tree" Mobile Flyout Breakage
* **Issue:** On mobile viewports (e.g., iPhone size 390px width), opening the "Switch Tree" dropdown renders a very wide popover menu. 
* **Impact:** The menu does not respect mobile boundaries, occasionally pushing the content horizontally or forcing the user to awkwardly scroll right to see the tree names.

### 2. Missing Account Settings Portal
* **Issue:** There is absolutely no centralized "Account Settings" page.
* **Impact:** Once a user signs up, there is no UI available for them to change their registered email address, update their password, or permanently delete their overarching User Account (they can only delete nodes in the tree).

### 3. Vouching System Ambiguity
* **Issue:** The "Vouch" button on a profile appears under the name with very little context. Clicking it immediately increments the counter, but there is no toast notification explaining what was done, nor is there a way to "Un-vouch" if clicked accidentally.

---

## 🟢 Low Priority (Edge Cases)

### 1. Zoom Bounds & Navigation Loss
* **Issue:** When using the zoom controls (`+` and `-`) continuously on a massive screen, or swiping rapidly on a trackpad, it is possible to lose sight of the tree completely. 
* **Recommendation:** The "Recentrum" (Về trung tâm) button handles this nicely, but setting a firm max/min bound on the zoom wrapper could prevent the tree from disappearing entirely into the void.

### 2. Saving "Empty" Profiles
* **Issue:** The "Add Person" drawer allows you to save a new relative without entering a First Name, Last Name, or any other details. 
* **Impact:** This generates a blank node on the tree with an empty ring. There is no enforced validation requiring at least a primary name.

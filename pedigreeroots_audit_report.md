# PedigreeRoots Bug & Design Audit Report
*Completed: April 10, 2026*

This report outlines the functional bugs, UX/UI issues, and localization gaps identified during a thorough audit of the authenticated areas of `pedigreeroots.com` (desktop and mobile views, English and Vietnamese languages).

---

## 🐞 Functional Bugs

**1. "Sticky" Dropdown Menu (High Priority)**
* **Issue:** The family switcher dropdown menu (e.g., "The Huynh Family") does not close automatically when clicking away or on other interactive elements (like the language toggle or profile panel).
* **Impact:** Causes visual overlap, obscuring other interface elements until manually dismissed.

**2. Session Context Loss on Logo Click (Medium Priority)**
* **Issue:** Clicking the "PedigreeRoots" logo while authenticated navigates the user to a generic guest landing page (`/`) instead of the user dashboard or their family tree.
* **Impact:** Shows "Sign In" and "Create Account" buttons to an already logged-in user, causing confusion and making it appear as though they have been logged out.

**3. Delayed Profile Panel Update (Low Priority)**
* **Issue:** When the Profile panel is open and a new person node is clicked on the tree, the panel's header and content sometimes lag.
* **Impact:** Briefly displays the previous person's data while the new node is highlighted, leading to a momentarily confusing UX.

---

## 🎨 UX/UI & Design Issues

**1. Low Contrast Input Fields**
* **Issue:** In the Profile panel, input fields (such as First Name, Last Name, and Dates) use a very light border and background color (light gray on cream background).
* **Impact:** May fail accessibility standards for readability and color contrast, making forms difficult to read or distinguish, especially for visually impaired users.

**2. Mobile Header Crowding**
* **Issue:** In smaller viewports (e.g., ≤400px width), header elements (Logo, Language Toggle, Hamburger Menu, and Logout) are tightly packed.
* **Impact:** Increases the likelihood of misclicking. Specifically, the "Logout" button is positioned very close to the navigation menu, risking accidental sign-outs.

**3. Overly Prominent "Delete Person" Button**
* **Issue:** The "Delete Person" button in the Relationships tab is extremely prominent (bright red) and positioned near standard navigation elements.
* **Impact:** Given the destructive nature of the action, this design choice increases the risk of accidental deletions. **Recommendation:** Relocate to a separate "Danger Zone" or ensure it requires a mandatory multi-step confirmation.

**4. Control Element Proximity (Mobile)**
* **Issue:** The "Recenter" button and the Zoom controls are both positioned in the bottom-left corner and sit very close together on mobile.
* **Impact:** Leads to overlapping or cramped layouts on devices with shorter aspect ratios.

---

## 🌐 Localization & Consistency (Vietnamese View)

**1. Inconsistent "Family" Translation**
* **Issue:** The family switcher button text remains in English (e.g., "The Huynh Family") even when the interface language is set to Vietnamese.
* **Impact:** Breaks immersion and consistency in localized views.

**2. Missing "My Family Tree" Label on Mobile**
* **Issue:** Upon switching to a mobile viewport width, the text label "My Family Tree" (*Cây Gia Phả*) disappears entirely without an icon replacement.
* **Impact:** Although accessible via the hamburger menu, this reduces the discoverability of a primary navigation path.

**3. Mixed Language in Tree Switcher**
* **Issue:** The tree selection menu contains English titles (e.g., "Nhan Nguyen's Family") alongside Vietnamese action labels (e.g., "CHUYỂN CÂY").
* **Impact:** Creates a disjointed, mixed-language UX. **Recommendation:** Dynamically translate suffixes like "'s Family" when generating tree names.

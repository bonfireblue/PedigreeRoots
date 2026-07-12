# PedigreeRoots Mobile Bug & Design Audit Report
*Completed: April 10, 2026*

This report outlines the mobile-specific functional bugs, UX/UI layout issues, and localization gaps identified during an audit of the authenticated areas of `pedigreeroots.com`, focusing heavily on narrow viewport sizes (like an iPhone or Android phone).

---

## 🛑 Header Overcrowding & Touch Target Issues (High Priority)

**1. Crowded Navigation Header**
*   **Issue:** On narrow screens (360px–390px), the `PedigreeRoots` logo, Language Switchers (`EN | VI`), Family Switcher caret, and Logout buttons are all forced into a single line at the top right. 
*   **Impact:** The spacing between these interactive elements is minimal (often < 8px). It is very easy to accidentally log out or switch families when simply trying to change the language.
*   **Recommendation:** Move the "Logout" or "Family Switcher" actions into a scalable "Hamburger" menu for screens narrower than 400px.

**2. Mislabeled "Logout" Icon**
*   **Issue:** The button at the far right uses a universal "Logout" icon (door with an arrow egressing). It lacks a clear `aria-label` and in some interactions behaves unexpectedly or causes immediate loss of session/context upon accidental tap.

---

## 🌐 Localization Bugs (Vietnamese)

**1. Hardcoded English Strings**
*   **Issue:** While most primary labels translate successfully, several critical action labels inside the "Add Person" and "Profile" flows remain in English.
    *   **Add Relation Form:** Labels like "ADD RELATION", "Create new", "Link existing", "First name" (placeholder text), and the primary "Add" submit button ignore the site-wide language state.
    *   **Family Switcher:** Family names display as "The [Name] Family", entirely skipping localization for the word "Family" (i.e. "Gia Đình").
    *   **Dates:** The date input placeholders remain in `mm/dd/yyyy` format regardless of checking Vietnamese locale standards.

**2. Delayed Translation Updates**
*   **Issue:** The "Invite to claim this profile" button text occasionally reverts to English or takes noticeably longer to update when the language is toggled.

---

## 📱 Layout & Functional Issues

**1. Side-by-Side Mobile Form Constraints**
*   **Issue:** In the "Profile" edit screens and "Add Person" bottom-sheet, the First Name and Last Name fields are placed side-by-side horizontally. 
*   **Impact:** On a narrow 360px screen, this makes the text inputs extremely short, causing standard names to be cut off visually.
*   **Recommendation:** Use a vertical stack (100% width) for text inputs on mobile resolutions.

**2. Low Contrast Input Fields**
*   **Issue:** Input borders in the bottom-sheet panels use a very light color (Stone-300) on a slightly off-white background.
*   **Impact:** Outdoors or on phones with lower brightness, the input shapes themselves are nearly invisible, failing WCAG accessibility contrast standards.

**3. Sticky Dropdown Menus**
*   **Issue:** The "Switch Tree" dropdown menu doesn't feature an adequate "click-away" listener. It fails to close automatically when tapping elsewhere on the screen (e.g., clicking a person card or interacting with the bottom sheet). This leaves the menu floating annoyingly over the main view.

**4. Oversized Bottom Sheet**
*   **Issue:** The profile panel acting as a large bottom sheet is structurally good, but it covers nearly ~90% of the screen height on smaller devices, making it very cramped and preventing users from referencing the tree chart behind it while editing.

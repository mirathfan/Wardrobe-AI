const nav = document.querySelector("[data-nav]");
const menuButton = document.querySelector("[data-menu-button]");
const navLinks = document.querySelectorAll("[data-nav-links] a");
const waitlistForm = document.querySelector("[data-waitlist-form]");
const formStatus = document.querySelector("[data-form-status]");

menuButton?.addEventListener("click", () => {
  const isOpen = nav?.classList.toggle("is-open") ?? false;
  menuButton.setAttribute("aria-expanded", String(isOpen));
  menuButton.setAttribute("aria-label", isOpen ? "Close menu" : "Open menu");
});

navLinks.forEach((link) => {
  link.addEventListener("click", () => {
    nav?.classList.remove("is-open");
    menuButton?.setAttribute("aria-expanded", "false");
    menuButton?.setAttribute("aria-label", "Open menu");
  });
});

waitlistForm?.addEventListener("submit", (event) => {
  event.preventDefault();

  const formData = new FormData(waitlistForm);
  const submission = {
    name: String(formData.get("name") || "").trim(),
    email: String(formData.get("email") || "").trim(),
    createdAt: new Date().toISOString(),
  };

  // TODO: Replace this local placeholder with Formspree, Firebase, Supabase, or Framer Forms.
  const existing = JSON.parse(localStorage.getItem("auraEarlyAccessRequests") || "[]");
  existing.push(submission);
  localStorage.setItem("auraEarlyAccessRequests", JSON.stringify(existing));

  waitlistForm.reset();
  if (formStatus) {
    formStatus.textContent = "Request saved for the beta list. We’ll be in touch.";
  }
});

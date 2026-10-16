const cards = document.querySelectorAll(".word-grid button");

for (const card of cards) {
  card.setAttribute("aria-expanded", "false");
  card.addEventListener("click", () => {
    const open = card.classList.toggle("revealed");
    card.setAttribute("aria-expanded", String(open));
  });
}

const sections = [...document.querySelectorAll("main section[id]")];
const links = [...document.querySelectorAll('.topic-nav nav a[href^="#"]')];
if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver((entries) => {
    const current = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (!current) return;
    links.forEach((link) => link.classList.toggle("current", link.hash === `#${current.target.id}`));
  }, { rootMargin: "-20% 0px -65%", threshold: [0, .2, .6] });
  sections.forEach((section) => observer.observe(section));
}

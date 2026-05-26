# To use Tailwind on your Astro site
Create your own stylesheet and import it in a layout:

/* src/styles/site.css */
@import "tailwindcss";
@source "../**/*.{astro,vue,js,ts}";

---
/* src/layouts/BaseLayout.astro */
import '../styles/site.css'
---

That's it. No second Tailwind install, no @astrojs/tailwind integration (Vulse already adds the v4 Vite plugin).

Alternative: skip Tailwind on the frontend
The playground uses plain CSS with custom properties in src/styles/site.css — no Tailwind utilities on the public site at all. That's a valid choice if you only want Tailwind inside /admin.

| Goal                      | What to do                                                        |
|---------------------------|-------------------------------------------------------------------|
| Tailwind on your site     | Add your own `site.css` with `@import "tailwindcss"` + `@source`  |
| Admin only                | Nothing — already handled by Vulse                                |
| Avoid Tailwind on frontend| Use plain CSS like the playground                                 |

Avoid importing @vulsecms/core/admin.css outside admin routes — it's scoped to the dashboard and uses admin-specific design tokens.
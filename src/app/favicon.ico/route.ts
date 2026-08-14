const icon=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#6254e8"/><path d="M19 15v34h27v-8H28V15z" fill="white"/></svg>`;

export function GET(){return new Response(icon,{headers:{"content-type":"image/svg+xml; charset=utf-8","cache-control":"public, max-age=86400, stale-while-revalidate=604800","x-content-type-options":"nosniff"}})}

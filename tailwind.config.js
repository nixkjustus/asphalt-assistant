/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  safelist: [
    'w-56', 'h-56', 'w-24', 'h-24', 'w-16', 'h-16', 'w-10', 'h-10', 'w-12', 'h-12', 'w-8', 'h-8',
    'bg-black', 'bg-white', 'text-white', 'text-black',
    'rounded-2xl', 'rounded-xl', 'rounded-full',
    'p-2', 'p-3', 'p-4', 'p-5', 'p-6',
    'm-2', 'mx-auto', 'flex', 'grid', 'hidden',
    'font-black', 'text-2xl', 'text-xl', 'text-sm',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}

export function Footer() {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="border-t-2 border-[#27272A] py-4 px-6 bg-white/50 text-center">
      <p className="text-[#52525B] text-xs font-semibold">
        Finance Agent Platform • {currentYear}
      </p>
    </footer>
  )
}

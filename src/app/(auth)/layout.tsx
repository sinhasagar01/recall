export default function AuthLayout({ children }: LayoutProps<'/'>) {
  return <div className="grid min-h-screen place-items-center px-5 py-10">{children}</div>
}

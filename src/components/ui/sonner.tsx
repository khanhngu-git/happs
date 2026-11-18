import { Toaster as Sonner, type ToasterProps } from 'sonner'

function Toaster(props: ToasterProps) {
  return <Sonner theme="system" position="top-center" richColors closeButton className="toaster group" {...props} />
}

export { Toaster }

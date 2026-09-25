import { Navigation } from "@/components/navigation";
import { Footer } from "@/components/footer";

export default function PublicLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <Navigation />
      {children}
      <Footer />
    </>
  );
}

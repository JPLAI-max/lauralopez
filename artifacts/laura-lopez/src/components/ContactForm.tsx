import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const formSchema = z.object({
  fullName: z.string().min(2, "Name is required"),
  email: z.string().email("Invalid email address"),
  phone: z.string().optional(),
  affiliation: z.string().min(1, "Please select an affiliation"),
  inquiryType: z.string().min(1, "Please select an inquiry type"),
  message: z.string().min(10, "Please provide some details"),
});

export default function ContactForm() {
  const { toast } = useToast();
  
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      fullName: "",
      email: "",
      phone: "",
      affiliation: "",
      inquiryType: "",
      message: "",
    },
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    toast({
      title: "Inquiry Submitted",
      description: "Thank you. We will be in touch shortly.",
    });
    form.reset();
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <FormField
            control={form.control}
            name="fullName"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="uppercase tracking-wider text-xs">Full Name</FormLabel>
                <FormControl>
                  <Input placeholder="Jane Doe" className="bg-transparent border-t-0 border-x-0 border-b border-border rounded-none px-0 focus-visible:ring-0 focus-visible:border-primary" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="uppercase tracking-wider text-xs">Email Address</FormLabel>
                <FormControl>
                  <Input type="email" placeholder="jane@example.com" className="bg-transparent border-t-0 border-x-0 border-b border-border rounded-none px-0 focus-visible:ring-0 focus-visible:border-primary" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <FormField
            control={form.control}
            name="phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="uppercase tracking-wider text-xs">Phone (Optional)</FormLabel>
                <FormControl>
                  <Input type="tel" placeholder="+1 (555) 000-0000" className="bg-transparent border-t-0 border-x-0 border-b border-border rounded-none px-0 focus-visible:ring-0 focus-visible:border-primary" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="affiliation"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="uppercase tracking-wider text-xs">Affiliation</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger className="bg-transparent border-t-0 border-x-0 border-b border-border rounded-none px-0 focus:ring-0 focus:border-primary">
                      <SelectValue placeholder="Select Affiliation" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="family-office">Family Office</SelectItem>
                    <SelectItem value="investment-advisor">Investment Advisor</SelectItem>
                    <SelectItem value="private-client">Private Client</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="inquiryType"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="uppercase tracking-wider text-xs">Type of Inquiry</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger className="bg-transparent border-t-0 border-x-0 border-b border-border rounded-none px-0 focus:ring-0 focus:border-primary">
                    <SelectValue placeholder="Select Inquiry Type" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="purchase-advisory">Purchase Advisory</SelectItem>
                  <SelectItem value="portfolio-review">Portfolio Review</SelectItem>
                  <SelectItem value="family-estate-planning">Family Estate Planning</SelectItem>
                  <SelectItem value="off-market-inquiry">Off-Market Inquiry</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="message"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="uppercase tracking-wider text-xs">Message</FormLabel>
              <FormControl>
                <Textarea 
                  placeholder="How may we assist you?" 
                  className="min-h-[120px] bg-transparent border-t-0 border-x-0 border-b border-border rounded-none px-0 focus-visible:ring-0 focus-visible:border-primary resize-none" 
                  {...field} 
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full sm:w-auto px-10 py-6 uppercase tracking-wider text-sm bg-primary hover:bg-primary/90 text-primary-foreground rounded-none">
          Submit Inquiry
        </Button>
      </form>
    </Form>
  );
}

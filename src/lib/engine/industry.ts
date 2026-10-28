/**
 * Lightweight industry classifier + knowledge base. Maps a free-text business
 * idea onto a known industry profile that supplies vocabulary used throughout
 * the deterministic engine (naming morphemes, competitor archetypes, channels,
 * value propositions, etc.). This is what makes key-free output feel bespoke
 * rather than generic.
 */

export interface IndustryProfile {
  key: string;
  label: string;
  keywords: string[];
  prefixes: string[];
  suffixes: string[];
  roots: string[];
  valueProps: string[];
  competitorArchetypes: { name: string; descriptor: string }[];
  channels: string[];
  painPoints: string[];
  goals: string[];
  services: { title: string; description: string }[];
  contentTopics: string[];
  iconHints: string[];
}

const PROFILES: IndustryProfile[] = [
  {
    key: "food",
    label: "Food & Beverage",
    keywords: ["restaurant", "cafe", "coffee", "bakery", "food", "kitchen", "catering", "bar", "pizza", "burger", "juice", "tea", "dessert", "bistro", "deli", "eatery", "diner"],
    prefixes: ["Fresh", "Golden", "Urban", "Rustic", "Daily", "The"],
    suffixes: ["Kitchen", "& Co", "House", "Table", "Bar", "Collective"],
    roots: ["Ember", "Harvest", "Cocoa", "Saffron", "Maple", "Basil", "Hearth", "Crumb", "Verde"],
    valueProps: ["A menu built around a few dishes done well", "Food prepared with care", "A welcoming place to come back to", "Seasonal ideas on the menu", "Friendly, unhurried service"],
    competitorArchetypes: [
      { name: "Established neighborhood favorite", descriptor: "Loyal regulars and strong word-of-mouth" },
      { name: "National chain", descriptor: "Aggressive pricing and brand recognition" },
      { name: "Trendy newcomer", descriptor: "Heavy social media presence" },
    ],
    channels: ["Instagram", "Google Business Profile", "TikTok", "Local delivery apps", "Email"],
    painPoints: ["Hard to find consistently good quality nearby", "Long wait times", "Limited healthy options", "Inconsistent service"],
    goals: ["Enjoy a memorable meal", "Find a reliable local spot", "Eat well without overspending", "Discover new flavors"],
    services: [
      { title: "Dine-In Experience", description: "A warm, thoughtfully designed space for every occasion." },
      { title: "Takeaway & Delivery", description: "Your favorites, ready when you are." },
      { title: "Catering & Events", description: "Crowd-pleasing menus for gatherings of any size." },
    ],
    contentTopics: ["Behind the kitchen", "Ingredient spotlights", "Customer favorites", "Seasonal specials", "Meet the team"],
    iconHints: ["leaf", "flame", "cup"],
  },
  {
    key: "fitness",
    label: "Fitness & Wellness",
    keywords: ["gym", "fitness", "yoga", "pilates", "wellness", "trainer", "workout", "health", "spa", "massage", "nutrition", "crossfit", "studio", "coaching"],
    prefixes: ["Pure", "Peak", "Vital", "Core", "Elevate", "Iron"],
    suffixes: ["Studio", "Lab", "Collective", "Method", "Co", "Club"],
    roots: ["Pulse", "Apex", "Forge", "Flow", "Summit", "Kinetic", "Thrive", "Ascend"],
    valueProps: ["Programmes planned around your goals", "Personal attention", "A supportive community", "Progress you track yourself", "Flexible scheduling"],
    competitorArchetypes: [
      { name: "Big-box gym", descriptor: "Low prices, high churn, impersonal" },
      { name: "Boutique studio", descriptor: "Premium pricing, strong community" },
      { name: "At-home app", descriptor: "Convenient and cheap, lacks accountability" },
    ],
    channels: ["Instagram", "TikTok", "Referral program", "Local partnerships", "Email"],
    painPoints: ["Lack of motivation", "Don't know where to start", "Plateauing results", "Intimidating gym environments"],
    goals: ["Get stronger and healthier", "Build a sustainable routine", "Feel confident", "Find accountability"],
    services: [
      { title: "1:1 Coaching", description: "Personalized programming and accountability." },
      { title: "Group Classes", description: "High-energy sessions that build community." },
      { title: "Nutrition Guidance", description: "Sustainable plans that fit your life." },
    ],
    contentTopics: ["Transformation stories", "Form tutorials", "Recovery tips", "Meal prep ideas", "Coach spotlights"],
    iconHints: ["bolt", "heart", "activity"],
  },
  {
    key: "cosmetics",
    label: "Cosmetics & Skincare",
    keywords: ["cosmetic", "cosmetics", "skincare", "skin care", "makeup", "serum", "moisturizer", "moisturiser", "cream", "lotion", "fragrance", "perfume", "lipstick", "haircare", "soap", "sunscreen", "beauty products", "kozmetik", "kozmetike"],
    prefixes: ["Pure", "Bare", "Glow", "True", "Clean", "Dew"],
    suffixes: ["Skin", "Beauty", "Lab", "Botanics", "Care", "Studio"],
    roots: ["Lumen", "Bloom", "Aura", "Petal", "Halo", "Dew", "Velour", "Sana"],
    valueProps: ["Clear ingredient information", "Products chosen for different skin types", "Simple routine guidance", "Everyday care at a fair price", "A focused, uncomplicated range"],
    competitorArchetypes: [
      { name: "International beauty retailer", descriptor: "Wide range and brand recognition, little personal guidance" },
      { name: "Pharmacy and drugstore brands", descriptor: "Trusted and accessible, generic advice" },
      { name: "Instagram resellers", descriptor: "Low prices, uncertain authenticity and storage" },
    ],
    channels: ["Instagram", "TikTok", "Online store", "Creator partnerships", "Email"],
    painPoints: ["Unsure which products suit their skin", "Worry about counterfeit or expired products", "Confusing ingredient claims", "Products that irritate sensitive skin"],
    goals: ["A simple routine that works", "Products they can trust", "Visible, realistic results", "Good value for daily care"],
    services: [
      { title: "Product range", description: "Core products for a simple daily routine." },
      { title: "Routine guidance", description: "Help choosing products for each skin type." },
      { title: "Bundles", description: "Starter sets that combine products that work together." },
    ],
    contentTopics: ["Ingredient explainers", "Routine guides", "Skin-type advice", "Product comparisons", "Customer questions"],
    iconHints: ["sparkle", "leaf", "heart"],
  },
  {
    key: "beauty",
    label: "Beauty & Personal Care",
    keywords: ["salon", "barber", "barbershop", "beauty salon", "hairdresser", "hair salon", "nails", "nail salon", "lash", "lashes", "brows", "aesthetics", "spa", "grooming", "tattoo", "manicure", "pedicure"],
    prefixes: ["Lush", "Velvet", "Luxe", "Glow", "Bare", "House of"],
    suffixes: ["Studio", "Atelier", "Beauty", "Lab", "Bar", "Salon"],
    roots: ["Lumen", "Bloom", "Sable", "Aura", "Petal", "Gloss", "Muse", "Halo"],
    valueProps: ["Treatments tailored to you", "Careful, attentive service", "A relaxing atmosphere", "Clear advice before every treatment", "Time set aside for you"],
    competitorArchetypes: [
      { name: "High-street chain salon", descriptor: "Convenient but generic experience" },
      { name: "Independent stylist", descriptor: "Personal but limited capacity" },
      { name: "Luxury spa", descriptor: "Premium pricing and exclusivity" },
    ],
    channels: ["Instagram", "TikTok", "Booking platforms", "Referrals", "Google Business Profile"],
    painPoints: ["Inconsistent results", "Hard to get appointments", "Feeling rushed", "Pushy upselling"],
    goals: ["Look and feel their best", "Find a trusted specialist", "A relaxing self-care ritual", "Lasting results"],
    services: [
      { title: "Signature Treatments", description: "Our most-loved services, refined to perfection." },
      { title: "Consultations", description: "Personalized recommendations for your goals." },
      { title: "Memberships", description: "Ongoing care with member-only perks." },
    ],
    contentTopics: ["Before & after", "Product breakdowns", "Aftercare tips", "Trend reports", "Client spotlights"],
    iconHints: ["sparkle", "heart", "star"],
  },
  {
    key: "tech",
    label: "Technology & SaaS",
    keywords: ["app", "software", "saas", "platform", "ai", "tech", "automation", "data", "api", "cloud", "dashboard", "analytics", "tool", "developer", "digital"],
    prefixes: ["Get", "Use", "Try", "Hyper", "Next", "Open"],
    suffixes: ["Labs", "AI", "HQ", "Stack", "Flow", "OS"],
    roots: ["Nova", "Vertex", "Quanta", "Cortex", "Pulse", "Orbit", "Cipher", "Lumen"],
    valueProps: ["Less time on repetitive work", "Built around one clear job", "Simple to set up", "Fits the way your team works", "Straightforward to learn"],
    competitorArchetypes: [
      { name: "Incumbent enterprise suite", descriptor: "Feature-rich but bloated and expensive" },
      { name: "Open-source alternative", descriptor: "Free but requires heavy setup" },
      { name: "Point solution", descriptor: "Narrow focus, limited workflow coverage" },
    ],
    channels: ["Product Hunt", "LinkedIn", "Content/SEO", "Cold email", "Developer communities"],
    painPoints: ["Manual, repetitive work", "Tools that don't talk to each other", "Steep learning curves", "Hidden costs"],
    goals: ["Automate busywork", "Make better decisions with data", "Scale without adding headcount", "Ship faster"],
    services: [
      { title: "Core Platform", description: "Everything you need in one connected workspace." },
      { title: "Integrations", description: "Connect the tools your team already uses." },
      { title: "Enterprise", description: "Advanced security, SSO, and dedicated support." },
    ],
    contentTopics: ["Product deep-dives", "Customer case studies", "Industry benchmarks", "How-to guides", "Changelog"],
    iconHints: ["bolt", "grid", "orbit"],
  },
  {
    key: "ecommerce",
    label: "E-commerce & Retail",
    keywords: ["shop", "store", "ecommerce", "retail", "boutique", "clothing", "fashion", "apparel", "jewelry", "accessories", "merch", "goods", "products", "brand"],
    prefixes: ["The", "Shop", "Maison", "House of", "Wear", "Daily"],
    suffixes: ["Co", "Goods", "Supply", "Studio", "Label", "Collective"],
    roots: ["Linen", "Atlas", "Ivory", "Nomad", "Stitch", "Ember", "Onyx", "Wilder"],
    valueProps: ["Thoughtfully chosen materials", "Designed to be worn often", "Clear sizing and care information", "A focused collection", "Easy ordering"],
    competitorArchetypes: [
      { name: "Fast-fashion giant", descriptor: "Cheap, trend-driven, low quality" },
      { name: "Marketplace seller", descriptor: "Wide selection, weak brand" },
      { name: "Premium heritage brand", descriptor: "High quality, high price" },
    ],
    channels: ["Instagram", "TikTok", "Meta Ads", "Email/SMS", "Influencer partnerships"],
    painPoints: ["Poor quality that wears out", "Confusing sizing", "Slow shipping", "Hard returns"],
    goals: ["Find pieces they love", "Shop with confidence", "Support brands they trust", "Get great value"],
    services: [
      { title: "New Arrivals", description: "Fresh drops added every season." },
      { title: "Best Sellers", description: "Customer favorites, restocked regularly." },
      { title: "Gift & Bundles", description: "Curated sets for every occasion." },
    ],
    contentTopics: ["Styling guides", "Behind the design", "Customer reviews", "Material stories", "Seasonal lookbooks"],
    iconHints: ["bag", "star", "grid"],
  },
  {
    key: "services",
    label: "Professional Services",
    keywords: ["consulting", "agency", "law", "legal", "accounting", "finance", "marketing", "design", "architecture", "real estate", "insurance", "recruiting", "advisory", "studio"],
    prefixes: ["The", "North", "Meridian", "Summit", "Cardinal", "Atlas"],
    suffixes: ["Group", "Partners", "Advisory", "Studio", "& Associates", "Collective"],
    roots: ["Meridian", "Beacon", "Anchor", "Keystone", "Vantage", "Compass", "Sterling", "Haven"],
    valueProps: ["Advice tailored to your situation", "Clear scope and pricing up front", "Direct access to the person doing the work", "Practical, actionable recommendations", "A hands-on working relationship"],
    competitorArchetypes: [
      { name: "Big-name firm", descriptor: "Prestige and reach, premium fees" },
      { name: "Solo freelancer", descriptor: "Affordable but limited bandwidth" },
      { name: "Generalist agency", descriptor: "Broad but lacks specialization" },
    ],
    channels: ["LinkedIn", "Referrals", "Content/SEO", "Networking events", "Email"],
    painPoints: ["Generic, cookie-cutter advice", "Unresponsive providers", "Opaque pricing", "Lack of measurable results"],
    goals: ["Solve a high-stakes problem", "Find a trusted expert", "Get measurable outcomes", "Reduce risk"],
    services: [
      { title: "Strategy & Advisory", description: "Clarity and a roadmap to your goals." },
      { title: "Implementation", description: "Hands-on delivery, done right." },
      { title: "Ongoing Partnership", description: "Continuous support as you grow." },
    ],
    contentTopics: ["Client results", "Industry insights", "Frameworks & playbooks", "Team expertise", "FAQs answered"],
    iconHints: ["compass", "shield", "grid"],
  },
  {
    key: "education",
    label: "Education & Coaching",
    keywords: ["course", "school", "academy", "tutoring", "education", "learning", "training", "coaching", "workshop", "bootcamp", "class", "mentor", "teach"],
    prefixes: ["The", "Bright", "Learn", "Master", "Open", "Future"],
    suffixes: ["Academy", "School", "Lab", "Institute", "Collective", "Method"],
    roots: ["Lumina", "Scholar", "Beacon", "Ascend", "Mentor", "Catalyst", "Forge", "Atlas"],
    valueProps: ["Learn by doing", "Lessons built around practice", "Clear learning goals", "Flexible pacing", "A supportive group"],
    competitorArchetypes: [
      { name: "Massive online platform", descriptor: "Huge catalog, low completion rates" },
      { name: "Traditional institution", descriptor: "Credible but slow and expensive" },
      { name: "Free content creator", descriptor: "Accessible but unstructured" },
    ],
    channels: ["YouTube", "Instagram", "Email", "LinkedIn", "Community/Discord"],
    painPoints: ["Information overload", "No clear path", "Lack of accountability", "Outdated material"],
    goals: ["Master a new skill", "Advance their career", "Learn efficiently", "Get real results"],
    services: [
      { title: "Flagship Program", description: "A structured path from beginner to confident." },
      { title: "Live Workshops", description: "Hands-on sessions with expert feedback." },
      { title: "Community Access", description: "Learn alongside a motivated cohort." },
    ],
    contentTopics: ["Student wins", "Quick tutorials", "Common mistakes", "Curriculum previews", "Career advice"],
    iconHints: ["star", "grid", "compass"],
  },
  {
    key: "home",
    label: "Home & Trades",
    keywords: ["cleaning", "plumbing", "electrician", "landscaping", "construction", "renovation", "handyman", "hvac", "roofing", "painting", "moving", "repair", "garden", "interior"],
    prefixes: ["Pro", "Reliable", "Premier", "All", "Solid", "Clear"],
    suffixes: ["Services", "Co", "Pros", "Works", "Solutions", "& Sons"],
    roots: ["Cornerstone", "Anchor", "Bluepeak", "Homestead", "Trueline", "Hearth", "Granite", "Maple"],
    valueProps: ["Clear quotes before work starts", "Turning up when agreed", "Tidy, careful work", "Easy to reach", "Serving the local area"],
    competitorArchetypes: [
      { name: "Large franchise", descriptor: "Recognizable but impersonal" },
      { name: "Independent operator", descriptor: "Cheap but inconsistent availability" },
      { name: "Online marketplace", descriptor: "Convenient but variable quality" },
    ],
    channels: ["Google Business Profile", "Local SEO", "Referrals", "Facebook", "Nextdoor"],
    painPoints: ["Unreliable scheduling", "Surprise charges", "Poor workmanship", "Hard to reach"],
    goals: ["Get the job done right", "A provider they can trust", "Fair, clear pricing", "Fast response"],
    services: [
      { title: "Standard Service", description: "Reliable, high-quality work on your schedule." },
      { title: "Emergency Call-Outs", description: "Fast response when you need it most." },
      { title: "Maintenance Plans", description: "Stay ahead of problems with regular care." },
    ],
    contentTopics: ["Before & after projects", "Maintenance tips", "Cost guides", "Customer reviews", "Seasonal checklists"],
    iconHints: ["shield", "grid", "compass"],
  },
  {
    key: "automotive",
    label: "Automotive",
    keywords: ["car", "cars", "vehicle", "vehicles", "automotive", "auto", "dealership", "detailing", "mechanic", "garage", "tyre", "tire", "car wash", "car import", "used cars", "makina", "vetura"],
    prefixes: ["Auto", "Drive", "Prime", "Road", "Motor", "Swift"],
    suffixes: ["Motors", "Auto", "Garage", "Cars", "Works", "Drive"],
    roots: ["Torque", "Axle", "Velo", "Piston", "Rally", "Gear", "Route", "Chassis"],
    valueProps: ["Clear information on every vehicle", "Fees explained up front", "Straight answers about repairs", "Updates while the work is done", "Help with the paperwork"],
    competitorArchetypes: [
      { name: "Franchised dealership", descriptor: "Warranty and trust, higher prices" },
      { name: "Private sellers and classifieds", descriptor: "Low prices, uncertain condition" },
      { name: "Independent workshop", descriptor: "Personal service, variable quality" },
    ],
    channels: ["Classified listing sites", "Facebook", "Google Business Profile", "Instagram", "Referrals"],
    painPoints: ["Hidden defects and unclear history", "Unexpected fees", "Slow paperwork", "Not knowing who to trust"],
    goals: ["A reliable vehicle at a fair price", "Clear, honest information", "Fast, hassle-free service", "Peace of mind"],
    services: [
      { title: "Vehicle sourcing", description: "Find and check vehicles that match the brief." },
      { title: "Inspection and history", description: "Condition checks before purchase." },
      { title: "Registration support", description: "Help with paperwork and handover." },
    ],
    contentTopics: ["Buying guides", "Inspection checklists", "Running-cost comparisons", "Maintenance tips", "Customer handovers"],
    iconHints: ["shield", "compass", "bolt"],
  },
  {
    key: "travel",
    label: "Travel & Hospitality",
    keywords: ["travel", "tour", "tours", "tourism", "hotel", "hostel", "guesthouse", "guest house", "bed and breakfast", "apartment rental", "excursion", "trekking", "hiking tours", "travel agency"],
    prefixes: ["Wander", "Go", "Trail", "Stay", "Explore", "The"],
    suffixes: ["Tours", "Travel", "Stays", "Trails", "House", "Journeys"],
    roots: ["Nomad", "Atlas", "Horizon", "Vista", "Compass", "Summit", "Harbor", "Ridge"],
    valueProps: ["Local knowledge of the area", "Clear itineraries and prices", "Small groups", "Flexible booking", "Experiences shaped by the place"],
    competitorArchetypes: [
      { name: "Online travel agency", descriptor: "Huge inventory, impersonal" },
      { name: "Local tour operator", descriptor: "Local knowledge, limited online presence" },
      { name: "Self-guided travel", descriptor: "Cheap, but time-consuming to plan" },
    ],
    channels: ["Booking platforms", "Instagram", "Google Business Profile", "TripAdvisor-style review sites", "Partnerships with hotels"],
    painPoints: ["Hard to judge quality before booking", "Hidden costs", "Overcrowded tourist experiences", "Language barriers"],
    goals: ["A memorable trip", "Good value", "Feeling safe and looked after", "Discovering something authentic"],
    services: [
      { title: "Signature experiences", description: "The trips and stays the business is known for." },
      { title: "Private bookings", description: "Tailored options for groups and families." },
      { title: "Travel support", description: "Help before and during the trip." },
    ],
    contentTopics: ["Destination guides", "Itinerary ideas", "Guest stories", "Seasonal highlights", "Practical travel tips"],
    iconHints: ["compass", "star", "leaf"],
  },
  {
    key: "logistics",
    label: "Logistics & Delivery",
    keywords: ["logistics", "courier", "delivery service", "last mile", "freight", "shipping company", "transport company", "trucking", "warehousing", "warehouse", "dispatch", "moving company"],
    prefixes: ["Swift", "Rapid", "Direct", "Prime", "Route", "On"],
    suffixes: ["Logistics", "Express", "Couriers", "Freight", "Delivery", "Transport"],
    roots: ["Relay", "Courier", "Vector", "Transit", "Arrow", "Cargo", "Dispatch", "Lane"],
    valueProps: ["Clear delivery windows", "Updates on each delivery", "Rates explained up front", "Careful handling", "Service planned around your routes"],
    competitorArchetypes: [
      { name: "National postal service", descriptor: "Wide coverage, slow and inflexible" },
      { name: "International courier", descriptor: "Fast and trusted, expensive" },
      { name: "Informal drivers", descriptor: "Cheap, unreliable and uninsured" },
    ],
    channels: ["Direct sales to businesses", "LinkedIn", "Google Business Profile", "Partnerships with online stores", "Referrals"],
    painPoints: ["Missed or late deliveries", "No tracking", "Damaged goods", "Unclear pricing"],
    goals: ["Deliveries that arrive on time", "Predictable costs", "Fewer customer complaints", "Simple booking"],
    services: [
      { title: "Same-day delivery", description: "Local deliveries within agreed windows." },
      { title: "Business accounts", description: "Regular collections for online stores and shops." },
      { title: "Tracking and proof of delivery", description: "Visibility for every parcel." },
    ],
    contentTopics: ["Delivery tips for sellers", "Coverage updates", "Customer case studies", "Packaging advice", "Behind the route"],
    iconHints: ["bolt", "grid", "compass"],
  },
  {
    key: "agriculture",
    label: "Agriculture & Food Production",
    keywords: ["farm", "farming", "agriculture", "agricultural", "greenhouse", "orchard", "honey", "beekeeping", "livestock", "dairy", "olive oil", "vineyard", "organic produce", "crops", "fruit", "vegetables"],
    prefixes: ["Green", "Fresh", "Field", "Valley", "Golden", "Wild"],
    suffixes: ["Farm", "Fields", "Harvest", "Produce", "Growers", "Orchards"],
    roots: ["Harvest", "Meadow", "Orchard", "Terra", "Furrow", "Sprout", "Grove", "Acre"],
    valueProps: ["Clear information on where produce comes from", "Seasonal produce", "Grown with care", "Buying direct from the producer", "Planned, regular supply"],
    competitorArchetypes: [
      { name: "Imported supermarket produce", descriptor: "Cheap and constant, less fresh" },
      { name: "Market stall producers", descriptor: "Fresh and local, inconsistent supply" },
      { name: "Industrial producer", descriptor: "Volume and price, little story" },
    ],
    channels: ["Direct to restaurants and shops", "Farmers' markets", "Facebook", "Instagram", "Wholesale buyers"],
    painPoints: ["Unclear origin of food", "Inconsistent quality", "Short shelf life", "Hard to buy directly from producers"],
    goals: ["Fresh, trustworthy food", "Supporting local producers", "Reliable supply", "Fair prices"],
    services: [
      { title: "Seasonal produce", description: "What the farm grows and when it is available." },
      { title: "Supply for businesses", description: "Regular orders for shops and restaurants." },
      { title: "Direct orders", description: "Boxes or pickups for households." },
    ],
    contentTopics: ["Harvest updates", "Meet the farm", "Recipes with seasonal produce", "How it's grown", "Buyer stories"],
    iconHints: ["leaf", "star", "heart"],
  },
  {
    key: "realEstate",
    label: "Real Estate & Property",
    keywords: ["real estate", "property", "properties", "realtor", "estate agent", "property management", "rentals", "apartments", "lettings", "property development"],
    prefixes: ["Prime", "Key", "Urban", "Home", "Capital", "The"],
    suffixes: ["Properties", "Estates", "Realty", "Homes", "Living", "Partners"],
    roots: ["Keystone", "Cornerstone", "Haven", "Vantage", "Domus", "Arch", "Crest", "Landmark"],
    valueProps: ["Clear, complete listings", "Fees explained up front", "Local market knowledge", "Prompt replies", "Support through the paperwork"],
    competitorArchetypes: [
      { name: "Established agency", descriptor: "Large portfolio, slow and impersonal" },
      { name: "Listing portals", descriptor: "Lots of choice, unverified listings" },
      { name: "Private owners", descriptor: "No fees, little support" },
    ],
    channels: ["Property portals", "Facebook", "Instagram", "Google Business Profile", "Referrals"],
    painPoints: ["Outdated or fake listings", "Unclear fees", "Slow responses", "Complicated paperwork"],
    goals: ["Find the right property quickly", "A fair deal", "Trustworthy advice", "A smooth transaction"],
    services: [
      { title: "Sales and lettings", description: "Listing and matching properties with buyers and tenants." },
      { title: "Property management", description: "Day-to-day care for owners." },
      { title: "Valuations", description: "Market-based price guidance." },
    ],
    contentTopics: ["Neighbourhood guides", "Market updates", "Buyer and renter tips", "Featured listings", "Owner advice"],
    iconHints: ["shield", "grid", "compass"],
  },
];

/** Discovery categories that tell the classifier which family of profiles to favour. */
const CATEGORY_HINTS: Record<string, Record<string, number>> = {
  software: { tech: 4 },
  food: { food: 4, agriculture: 1 },
  ecommerce: { ecommerce: 1, cosmetics: 1 },
  services: { services: 1, home: 1, beauty: 1, logistics: 1, realEstate: 1, automotive: 1, travel: 1, education: 1, fitness: 1 },
};

/** Whole-word match (with simple plurals), so "ai" never matches "retail" and "app" never matches "apparel". */
function keywordPattern(keyword: string): RegExp {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?:s|es)?(?=$|[^\\p{L}\\p{N}])`, "iu");
}

const KEYWORD_PATTERNS = new Map<string, RegExp>();
function matchesKeyword(text: string, keyword: string): boolean {
  let pattern = KEYWORD_PATTERNS.get(keyword);
  if (!pattern) {
    pattern = keywordPattern(keyword);
    KEYWORD_PATTERNS.set(keyword, pattern);
  }
  return pattern.test(text);
}

const GENERIC: IndustryProfile = {
  key: "generic",
  label: "Modern Business",
  keywords: [],
  prefixes: ["The", "Get", "Go", "New", "Bright", "True"],
  suffixes: ["Co", "Studio", "Group", "Labs", "Collective", "HQ"],
  roots: ["Nova", "Vertex", "Beacon", "Atlas", "Lumen", "Apex", "Haven", "Orbit"],
  valueProps: ["Customer-first approach", "Careful attention to detail", "Transparent and fair", "Built around your needs", "Clear communication"],
  competitorArchetypes: [
    { name: "Established market leader", descriptor: "Strong brand, slow to innovate" },
    { name: "Budget alternative", descriptor: "Low price, low differentiation" },
    { name: "Emerging challenger", descriptor: "Fresh approach, building trust" },
  ],
  channels: ["Instagram", "Google", "Email", "Referrals", "LinkedIn"],
  painPoints: ["Underwhelming experiences", "Poor communication", "Lack of trust", "Generic, one-size-fits-all options"],
  goals: ["A solution that just works", "A brand they can trust", "Great value", "A delightful experience"],
  services: [
    { title: "Core Offering", description: "Everything you need, thoughtfully delivered." },
    { title: "Premium Tier", description: "Elevated service for those who want more." },
    { title: "Support", description: "We're with you every step of the way." },
  ],
  contentTopics: ["Customer stories", "Behind the scenes", "Tips & guides", "Product highlights", "Team spotlights"],
  iconHints: ["star", "grid", "bolt"],
};

/** Every built-in profile, including the generic fallback. */
export const ALL_INDUSTRY_PROFILES: readonly IndustryProfile[] = [...PROFILES, GENERIC];

/**
 * Picks the closest industry profile for a business description. `category` is
 * the owner's own discovery category; it only breaks ties toward the profiles
 * that category covers and never overrides clear keyword evidence.
 */
export function detectIndustry(text: string, category?: string): IndustryProfile {
  const hints = (category && CATEGORY_HINTS[category]) || {};
  let best: { profile: IndustryProfile; score: number } | null = null;
  for (const profile of PROFILES) {
    let score = 0;
    for (const kw of profile.keywords) {
      if (matchesKeyword(text, kw)) score += kw.length > 5 ? 2 : 1;
    }
    if (score > 0) score += hints[profile.key] ?? 0;
    if (score > 0 && (!best || score > best.score)) best = { profile, score };
  }
  if (!best && category === "software") return PROFILES.find((p) => p.key === "tech")!;
  return best?.profile ?? GENERIC;
}

/** Industry for a business input: idea plus the owner's offering, guided by their discovery category. */
export function detectInputIndustry(input: { idea: string; discovery?: { business: { offering: string; category: string } } }): IndustryProfile {
  const offering = input.discovery?.business.offering ?? "";
  return detectIndustry(`${input.idea} ${offering}`, input.discovery?.business.category);
}

export { GENERIC as GENERIC_INDUSTRY };

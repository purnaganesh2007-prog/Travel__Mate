/**
 * TRAVELMATE — MULTIMODAL TRANSPORT COMPARISON & DIRECT REDIRECT LOGIC
 * Features complete pre-filling for:
 * 1. redRail (Indian Railways station codes & journey date)
 * 2. redBus (Official redBus city IDs, slugs, and date format)
 * 3. Booking.com Flights (3-letter IATA airport codes, passenger count, departure date)
 * 4. Local Cabs & Maps (Uber, Rapido, Google Maps)
 */

let currentTransportFilter = "all";
let currentSortBy = "recommended";
let transportLoadVersion = 0;

/**
 * COMPREHENSIVE REPOSITORY OF TRANSIT HUBS (Station Codes, Bus IDs, Airport Codes)
 * Covers 80+ top metro cities, state capitals, tourist hotspots, and international hubs.
 */
const TM_TRANSIT_HUBS = [
  {
    city: "New Delhi",
    aliases: ["delhi", "new delhi", "del", "ndls", "ncr", "noida", "gurgaon", "gurugram", "ghaziabad", "faridabad"],
    railCode: "NDLS",
    altRailCodes: ["DLI", "NZM", "DEE", "DEC"],
    railName: "New Delhi (NDLS)",
    busId: "145",
    busName: "Delhi",
    busSlug: "delhi",
    flightIata: "DEL",
    flightName: "Indira Gandhi International Airport (DEL)",
    state: "Delhi"
  },
  {
    city: "Mumbai",
    aliases: ["mumbai", "bombay", "bom", "mmct", "csmt", "thane", "navi mumbai", "bandra"],
    railCode: "MMCT",
    altRailCodes: ["CSMT", "BDTS", "DR", "LTT"],
    railName: "Mumbai Central (MMCT)",
    busId: "462",
    busName: "Mumbai",
    busSlug: "mumbai",
    flightIata: "BOM",
    flightName: "Chhatrapati Shivaji Maharaj International (BOM)",
    state: "Maharashtra"
  },
  {
    city: "Bengaluru",
    aliases: ["bangalore", "bengaluru", "blr", "sbc", "ypr", "whitefield", "electronic city", "majestic"],
    railCode: "SBC",
    altRailCodes: ["YPR", "SMVB", "BNC"],
    railName: "KSR Bengaluru City (SBC)",
    busId: "122",
    busName: "Bangalore",
    busSlug: "bangalore",
    flightIata: "BLR",
    flightName: "Kempegowda International Airport (BLR)",
    state: "Karnataka"
  },
  {
    city: "Hyderabad",
    aliases: ["hyderabad", "secunderabad", "hyd", "hyb", "sc", "cyberabad", "hitech city", "gachibowli"],
    railCode: "HYB",
    altRailCodes: ["SC", "KCG", "LPI"],
    railName: "Hyderabad Deccan (HYB)",
    busId: "471",
    busName: "Hyderabad",
    busSlug: "hyderabad",
    flightIata: "HYD",
    flightName: "Rajiv Gandhi International Airport (HYD)",
    state: "Telangana"
  },
  {
    city: "Chennai",
    aliases: ["chennai", "madras", "maa", "mas", "egmore", "tambaram"],
    railCode: "MAS",
    altRailCodes: ["MS", "TBM"],
    railName: "MGR Chennai Central (MAS)",
    busId: "123",
    busName: "Chennai",
    busSlug: "chennai",
    flightIata: "MAA",
    flightName: "Chennai International Airport (MAA)",
    state: "Tamil Nadu"
  },
  {
    city: "Kolkata",
    aliases: ["kolkata", "calcutta", "ccu", "hwh", "sdah", "howrah", "sealdah", "salt lake"],
    railCode: "HWH",
    altRailCodes: ["SDAH", "KOAA", "SHM"],
    railName: "Howrah Junction (HWH)",
    busId: "133",
    busName: "Kolkata",
    busSlug: "kolkata",
    flightIata: "CCU",
    flightName: "Netaji Subhash Chandra Bose International (CCU)",
    state: "West Bengal"
  },
  {
    city: "Pune",
    aliases: ["pune", "pnq", "poona", "pcmc", "hinjawadi", "shivajinagar"],
    railCode: "PUNE",
    altRailCodes: ["SVJR", "HDP"],
    railName: "Pune Junction (PUNE)",
    busId: "130",
    busName: "Pune",
    busSlug: "pune",
    flightIata: "PNQ",
    flightName: "Pune International Airport (PNQ)",
    state: "Maharashtra"
  },
  {
    city: "Ahmedabad",
    aliases: ["ahmedabad", "amd", "adi", "amdavad", "gandhinagar", "sabarmati"],
    railCode: "ADI",
    altRailCodes: ["SBT", "MAN"],
    railName: "Ahmedabad Junction (ADI)",
    busId: "128",
    busName: "Ahmedabad",
    busSlug: "ahmedabad",
    flightIata: "AMD",
    flightName: "Sardar Vallabhbhai Patel International (AMD)",
    state: "Gujarat"
  },
  {
    city: "Jaipur",
    aliases: ["jaipur", "jai", "jp", "pink city"],
    railCode: "JP",
    altRailCodes: ["GADJ"],
    railName: "Jaipur Junction (JP)",
    busId: "129",
    busName: "Jaipur",
    busSlug: "jaipur",
    flightIata: "JAI",
    flightName: "Jaipur International Airport (JAI)",
    state: "Rajasthan"
  },
  {
    city: "Goa",
    aliases: ["goa", "panaji", "panjim", "madgaon", "margao", "vasco", "calangute", "candolim", "baga", "goi", "gox", "mao"],
    railCode: "MAO",
    altRailCodes: ["KRMI", "VSG"],
    railName: "Madgaon Junction (MAO)",
    busId: "132",
    busName: "Goa",
    busSlug: "goa",
    flightIata: "GOI",
    flightName: "Goa Dabolim Airport (GOI)",
    state: "Goa"
  },
  {
    city: "Visakhapatnam",
    aliases: ["visakhapatnam", "vizag", "vskp", "vtz", "waltair"],
    railCode: "VSKP",
    altRailCodes: [],
    railName: "Visakhapatnam Junction (VSKP)",
    busId: "135",
    busName: "Visakhapatnam",
    busSlug: "visakhapatnam",
    flightIata: "VTZ",
    flightName: "Visakhapatnam International Airport (VTZ)",
    state: "Andhra Pradesh"
  },
  {
    city: "Vijayawada",
    aliases: ["vijayawada", "bezawada", "bza", "vga", "amaravati"],
    railCode: "BZA",
    altRailCodes: [],
    railName: "Vijayawada Junction (BZA)",
    busId: "463",
    busName: "Vijayawada",
    busSlug: "vijayawada",
    flightIata: "VGA",
    flightName: "Vijayawada Airport (VGA)",
    state: "Andhra Pradesh"
  },
  {
    city: "Tirupati",
    aliases: ["tirupati", "tirumala", "tpty", "tir", "renigunta"],
    railCode: "TPTY",
    altRailCodes: ["RU"],
    railName: "Tirupati Main (TPTY)",
    busId: "134",
    busName: "Tirupati",
    busSlug: "tirupati",
    flightIata: "TIR",
    flightName: "Tirupati Airport (TIR)",
    state: "Andhra Pradesh"
  },
  {
    city: "Guntur",
    aliases: ["guntur", "gnt"],
    railCode: "GNT",
    altRailCodes: [],
    railName: "Guntur Junction (GNT)",
    busId: "464",
    busName: "Guntur",
    busSlug: "guntur",
    flightIata: "VGA",
    flightName: "Vijayawada Airport (VGA)",
    state: "Andhra Pradesh"
  },
  {
    city: "Nellore",
    aliases: ["nellore", "nlr"],
    railCode: "NLR",
    altRailCodes: [],
    railName: "Nellore (NLR)",
    busId: "465",
    busName: "Nellore",
    busSlug: "nellore",
    flightIata: "TIR",
    flightName: "Tirupati Airport (TIR)",
    state: "Andhra Pradesh"
  },
  {
    city: "Kurnool",
    aliases: ["kurnool", "krnt", "kjb"],
    railCode: "KRNT",
    altRailCodes: [],
    railName: "Kurnool City (KRNT)",
    busId: "466",
    busName: "Kurnool",
    busSlug: "kurnool",
    flightIata: "KJB",
    flightName: "Kurnool Airport (KJB)",
    state: "Andhra Pradesh"
  },
  {
    city: "Rajahmundry",
    aliases: ["rajahmundry", "rajamahendravaram", "rjy", "rja"],
    railCode: "RJY",
    altRailCodes: [],
    railName: "Rajahmundry (RJY)",
    busId: "473",
    busName: "Rajahmundry",
    busSlug: "rajahmundry",
    flightIata: "RJA",
    flightName: "Rajahmundry Airport (RJA)",
    state: "Andhra Pradesh"
  },
  {
    city: "Kakinada",
    aliases: ["kakinada", "cct", "coa"],
    railCode: "CCT",
    altRailCodes: ["COA"],
    railName: "Kakinada Town (CCT)",
    busId: "472",
    busName: "Kakinada",
    busSlug: "kakinada",
    flightIata: "RJA",
    flightName: "Rajahmundry Airport (RJA)",
    state: "Andhra Pradesh"
  },
  {
    city: "Anantapur",
    aliases: ["anantapur", "anantapuram", "atp"],
    railCode: "ATP",
    altRailCodes: [],
    railName: "Anantapur (ATP)",
    busId: "474",
    busName: "Anantapur",
    busSlug: "anantapur",
    flightIata: "BLR",
    flightName: "Kempegowda International Airport (BLR)",
    state: "Andhra Pradesh"
  },
  {
    city: "Kadapa",
    aliases: ["kadapa", "cuddapah", "hx", "cdp"],
    railCode: "HX",
    altRailCodes: [],
    railName: "Kadapa Junction (HX)",
    busId: "475",
    busName: "Kadapa",
    busSlug: "kadapa",
    flightIata: "CDP",
    flightName: "Kadapa Airport (CDP)",
    state: "Andhra Pradesh"
  },
  {
    city: "Warangal",
    aliases: ["warangal", "hanmakonda", "kazipet", "wl", "kzj"],
    railCode: "WL",
    altRailCodes: ["KZJ"],
    railName: "Warangal (WL)",
    busId: "467",
    busName: "Warangal",
    busSlug: "warangal",
    flightIata: "HYD",
    flightName: "Rajiv Gandhi International (HYD)",
    state: "Telangana"
  },
  {
    city: "Kochi",
    aliases: ["kochi", "cochin", "ernakulam", "cok", "ers", "ern"],
    railCode: "ERS",
    altRailCodes: ["ERN"],
    railName: "Ernakulam Junction (ERS)",
    busId: "146",
    busName: "Kochi",
    busSlug: "kochi",
    flightIata: "COK",
    flightName: "Cochin International Airport (COK)",
    state: "Kerala"
  },
  {
    city: "Thiruvananthapuram",
    aliases: ["trivandrum", "thiruvananthapuram", "tvc", "trv", "kovalam"],
    railCode: "TVC",
    altRailCodes: [],
    railName: "Thiruvananthapuram Central (TVC)",
    busId: "147",
    busName: "Trivandrum",
    busSlug: "trivandrum",
    flightIata: "TRV",
    flightName: "Thiruvananthapuram International (TRV)",
    state: "Kerala"
  },
  {
    city: "Kozhikode",
    aliases: ["kozhikode", "calicut", "clt", "ccj"],
    railCode: "CLT",
    altRailCodes: [],
    railName: "Kozhikode Main (CLT)",
    busId: "148",
    busName: "Kozhikode",
    busSlug: "kozhikode",
    flightIata: "CCJ",
    flightName: "Calicut International Airport (CCJ)",
    state: "Kerala"
  },
  {
    city: "Mangaluru",
    aliases: ["mangalore", "mangaluru", "maq", "majn", "ixe"],
    railCode: "MAQ",
    altRailCodes: ["MAJN"],
    railName: "Mangaluru Central (MAQ)",
    busId: "149",
    busName: "Mangalore",
    busSlug: "mangalore",
    flightIata: "IXE",
    flightName: "Mangaluru International Airport (IXE)",
    state: "Karnataka"
  },
  {
    city: "Mysuru",
    aliases: ["mysore", "mysuru", "mys", "myq"],
    railCode: "MYS",
    altRailCodes: [],
    railName: "Mysuru Junction (MYS)",
    busId: "125",
    busName: "Mysore",
    busSlug: "mysore",
    flightIata: "MYQ",
    flightName: "Mysore Airport (MYQ)",
    state: "Karnataka"
  },
  {
    city: "Hubballi",
    aliases: ["hubli", "hubballi", "ubl", "hbx"],
    railCode: "UBL",
    altRailCodes: [],
    railName: "SSS Hubballi Junction (UBL)",
    busId: "150",
    busName: "Hubli",
    busSlug: "hubli",
    flightIata: "HBX",
    flightName: "Hubballi Airport (HBX)",
    state: "Karnataka"
  },
  {
    city: "Belagavi",
    aliases: ["belgaum", "belagavi", "bgm", "ixg"],
    railCode: "BGM",
    altRailCodes: [],
    railName: "Belagavi (BGM)",
    busId: "151",
    busName: "Belgaum",
    busSlug: "belgaum",
    flightIata: "IXG",
    flightName: "Belagavi Airport (IXG)",
    state: "Karnataka"
  },
  {
    city: "Hampi",
    aliases: ["hampi", "hosapete", "hospet", "hpt"],
    railCode: "HPT",
    altRailCodes: [],
    railName: "Hosapete Junction (HPT)",
    busId: "562",
    busName: "Hampi",
    busSlug: "hampi",
    flightIata: "VDY",
    flightName: "Jindal Vijayanagar Airport (VDY)",
    state: "Karnataka"
  },
  {
    city: "Gokarna",
    aliases: ["gokarna", "gokarn", "gok"],
    railCode: "GOK",
    altRailCodes: [],
    railName: "Gokarna Road (GOK)",
    busId: "563",
    busName: "Gokarna",
    busSlug: "gokarna",
    flightIata: "GOI",
    flightName: "Goa Dabolim Airport (GOI)",
    state: "Karnataka"
  },
  {
    city: "Coorg",
    aliases: ["coorg", "madikeri", "kodagu"],
    railCode: "MYS",
    altRailCodes: [],
    railName: "Mysuru Station (MYS)",
    busId: "564",
    busName: "Coorg",
    busSlug: "coorg",
    flightIata: "CNN",
    flightName: "Kannur International Airport (CNN)",
    state: "Karnataka"
  },
  {
    city: "Coimbatore",
    aliases: ["coimbatore", "cbe", "cjb", "kovai"],
    railCode: "CBE",
    altRailCodes: [],
    railName: "Coimbatore Main (CBE)",
    busId: "127",
    busName: "Coimbatore",
    busSlug: "coimbatore",
    flightIata: "CJB",
    flightName: "Coimbatore International Airport (CJB)",
    state: "Tamil Nadu"
  },
  {
    city: "Madurai",
    aliases: ["madurai", "mdu", "ixm"],
    railCode: "MDU",
    altRailCodes: [],
    railName: "Madurai Junction (MDU)",
    busId: "131",
    busName: "Madurai",
    busSlug: "madurai",
    flightIata: "IXM",
    flightName: "Madurai Airport (IXM)",
    state: "Tamil Nadu"
  },
  {
    city: "Tiruchirappalli",
    aliases: ["trichy", "tiruchirappalli", "tiruchi", "tpj", "trz"],
    railCode: "TPJ",
    altRailCodes: [],
    railName: "Tiruchchirappalli Junction (TPJ)",
    busId: "470",
    busName: "Trichy",
    busSlug: "trichy",
    flightIata: "TRZ",
    flightName: "Tiruchirappalli International (TRZ)",
    state: "Tamil Nadu"
  },
  {
    city: "Salem",
    aliases: ["salem", "sa", "sxv"],
    railCode: "SA",
    altRailCodes: [],
    railName: "Salem Junction (SA)",
    busId: "469",
    busName: "Salem",
    busSlug: "salem",
    flightIata: "SXV",
    flightName: "Salem Airport (SXV)",
    state: "Tamil Nadu"
  },
  {
    city: "Puducherry",
    aliases: ["pondicherry", "puducherry", "pdy", "pny", "auroville"],
    railCode: "PDY",
    altRailCodes: [],
    railName: "Puducherry (PDY)",
    busId: "468",
    busName: "Pondicherry",
    busSlug: "pondicherry",
    flightIata: "PNY",
    flightName: "Puducherry Airport (PNY)",
    state: "Puducherry"
  },
  {
    city: "Ooty",
    aliases: ["ooty", "udhagamandalam", "uam", "nilgiris"],
    railCode: "UAM",
    altRailCodes: ["MTP", "CBE"],
    railName: "Udhagamandalam (UAM)",
    busId: "517",
    busName: "Ooty",
    busSlug: "ooty",
    flightIata: "CJB",
    flightName: "Coimbatore International Airport (CJB)",
    state: "Tamil Nadu"
  },
  {
    city: "Kodaikanal",
    aliases: ["kodaikanal", "kodai", "kqn"],
    railCode: "KQN",
    altRailCodes: ["MDU"],
    railName: "Kodaikanal Road (KQN)",
    busId: "518",
    busName: "Kodaikanal",
    busSlug: "kodaikanal",
    flightIata: "IXM",
    flightName: "Madurai Airport (IXM)",
    state: "Tamil Nadu"
  },
  {
    city: "Munnar",
    aliases: ["munnar", "devikulam"],
    railCode: "AWY",
    altRailCodes: ["ERS"],
    railName: "Aluva (AWY) / Ernakulam (ERS)",
    busId: "519",
    busName: "Munnar",
    busSlug: "munnar",
    flightIata: "COK",
    flightName: "Cochin International Airport (COK)",
    state: "Kerala"
  },
  {
    city: "Alappuzha",
    aliases: ["alleppey", "alappuzha", "allp"],
    railCode: "ALLP",
    altRailCodes: ["ERS"],
    railName: "Alappuzha (ALLP)",
    busId: "520",
    busName: "Alappuzha",
    busSlug: "alleppey",
    flightIata: "COK",
    flightName: "Cochin International Airport (COK)",
    state: "Kerala"
  },
  {
    city: "Agra",
    aliases: ["agra", "taj mahal", "agc", "agr"],
    railCode: "AGC",
    altRailCodes: ["AF", "RKM"],
    railName: "Agra Cantt (AGC)",
    busId: "136",
    busName: "Agra",
    busSlug: "agra",
    flightIata: "AGR",
    flightName: "Agra Airport (AGR)",
    state: "Uttar Pradesh"
  },
  {
    city: "Varanasi",
    aliases: ["varanasi", "banaras", "benares", "kashi", "bsb", "vns", "mughalsarai"],
    railCode: "BSB",
    altRailCodes: ["MUV", "DDU"],
    railName: "Varanasi Junction (BSB)",
    busId: "137",
    busName: "Varanasi",
    busSlug: "varanasi",
    flightIata: "VNS",
    flightName: "Lal Bahadur Shastri International (VNS)",
    state: "Uttar Pradesh"
  },
  {
    city: "Lucknow",
    aliases: ["lucknow", "lko", "charbagh"],
    railCode: "LKO",
    altRailCodes: ["LJN"],
    railName: "Lucknow Charbagh (LKO)",
    busId: "138",
    busName: "Lucknow",
    busSlug: "lucknow",
    flightIata: "LKO",
    flightName: "Chaudhary Charan Singh International (LKO)",
    state: "Uttar Pradesh"
  },
  {
    city: "Kanpur",
    aliases: ["kanpur", "cnb", "knu"],
    railCode: "CNB",
    altRailCodes: [],
    railName: "Kanpur Central (CNB)",
    busId: "529",
    busName: "Kanpur",
    busSlug: "kanpur",
    flightIata: "KNU",
    flightName: "Kanpur Airport (KNU)",
    state: "Uttar Pradesh"
  },
  {
    city: "Prayagraj",
    aliases: ["prayagraj", "allahabad", "pryj", "ixd"],
    railCode: "PRYJ",
    altRailCodes: ["ALD"],
    railName: "Prayagraj Junction (PRYJ)",
    busId: "530",
    busName: "Allahabad",
    busSlug: "allahabad",
    flightIata: "IXD",
    flightName: "Prayagraj Airport (IXD)",
    state: "Uttar Pradesh"
  },
  {
    city: "Ayodhya",
    aliases: ["ayodhya", "faizabad", "ay", "ayj"],
    railCode: "AY",
    altRailCodes: ["AYC"],
    railName: "Ayodhya Dham (AY)",
    busId: "539",
    busName: "Ayodhya",
    busSlug: "ayodhya",
    flightIata: "AYJ",
    flightName: "Maharishi Valmiki International (AYJ)",
    state: "Uttar Pradesh"
  },
  {
    city: "Chandigarh",
    aliases: ["chandigarh", "cdg", "ixc", "mohali", "panchkula"],
    railCode: "CDG",
    altRailCodes: [],
    railName: "Chandigarh Junction (CDG)",
    busId: "124",
    busName: "Chandigarh",
    busSlug: "chandigarh",
    flightIata: "IXC",
    flightName: "Shaheed Bhagat Singh International (IXC)",
    state: "Chandigarh"
  },
  {
    city: "Amritsar",
    aliases: ["amritsar", "golden temple", "asr", "atq"],
    railCode: "ASR",
    altRailCodes: [],
    railName: "Amritsar Junction (ASR)",
    busId: "509",
    busName: "Amritsar",
    busSlug: "amritsar",
    flightIata: "ATQ",
    flightName: "Sri Guru Ram Dass Jee International (ATQ)",
    state: "Punjab"
  },
  {
    city: "Surat",
    aliases: ["surat", "st", "stv"],
    railCode: "ST",
    altRailCodes: [],
    railName: "Surat (ST)",
    busId: "141",
    busName: "Surat",
    busSlug: "surat",
    flightIata: "STV",
    flightName: "Surat International Airport (STV)",
    state: "Gujarat"
  },
  {
    city: "Vadodara",
    aliases: ["vadodara", "baroda", "brc", "bdq"],
    railCode: "BRC",
    altRailCodes: [],
    railName: "Vadodara Junction (BRC)",
    busId: "142",
    busName: "Vadodara",
    busSlug: "vadodara",
    flightIata: "BDQ",
    flightName: "Vadodara Airport (BDQ)",
    state: "Gujarat"
  },
  {
    city: "Rajkot",
    aliases: ["rajkot", "rjt", "raj"],
    railCode: "RJT",
    altRailCodes: [],
    railName: "Rajkot Junction (RJT)",
    busId: "143",
    busName: "Rajkot",
    busSlug: "rajkot",
    flightIata: "RAJ",
    flightName: "Rajkot International Airport (RAJ)",
    state: "Gujarat"
  },
  {
    city: "Indore",
    aliases: ["indore", "indb", "idr"],
    railCode: "INDB",
    altRailCodes: [],
    railName: "Indore Junction (INDB)",
    busId: "139",
    busName: "Indore",
    busSlug: "indore",
    flightIata: "IDR",
    flightName: "Devi Ahilyabai Holkar Airport (IDR)",
    state: "Madhya Pradesh"
  },
  {
    city: "Bhopal",
    aliases: ["bhopal", "bpl", "bho", "rani kamlapati", "habibganj"],
    railCode: "BPL",
    altRailCodes: ["RKMP"],
    railName: "Bhopal Junction (BPL)",
    busId: "140",
    busName: "Bhopal",
    busSlug: "bhopal",
    flightIata: "BHO",
    flightName: "Raja Bhoj Airport (BHO)",
    state: "Madhya Pradesh"
  },
  {
    city: "Gwalior",
    aliases: ["gwalior", "gwl"],
    railCode: "GWL",
    altRailCodes: [],
    railName: "Gwalior Junction (GWL)",
    busId: "528",
    busName: "Gwalior",
    busSlug: "gwalior",
    flightIata: "GWL",
    flightName: "Rajmata Vijaya Raje Scindia Airport (GWL)",
    state: "Madhya Pradesh"
  },
  {
    city: "Jabalpur",
    aliases: ["jabalpur", "jbp", "jlr"],
    railCode: "JBP",
    altRailCodes: [],
    railName: "Jabalpur (JBP)",
    busId: "527",
    busName: "Jabalpur",
    busSlug: "jabalpur",
    flightIata: "JLR",
    flightName: "Jabalpur Airport (JLR)",
    state: "Madhya Pradesh"
  },
  {
    city: "Udaipur",
    aliases: ["udaipur", "udz", "udr", "city of lakes"],
    railCode: "UDZ",
    altRailCodes: [],
    railName: "Udaipur City (UDZ)",
    busId: "506",
    busName: "Udaipur",
    busSlug: "udaipur",
    flightIata: "UDR",
    flightName: "Maharana Pratap Airport (UDR)",
    state: "Rajasthan"
  },
  {
    city: "Jodhpur",
    aliases: ["jodhpur", "ju", "jdh", "sun city"],
    railCode: "JU",
    altRailCodes: [],
    railName: "Jodhpur Junction (JU)",
    busId: "507",
    busName: "Jodhpur",
    busSlug: "jodhpur",
    flightIata: "JDH",
    flightName: "Jodhpur Airport (JDH)",
    state: "Rajasthan"
  },
  {
    city: "Jaisalmer",
    aliases: ["jaisalmer", "jsm", "jsa", "golden city"],
    railCode: "JSM",
    altRailCodes: [],
    railName: "Jaisalmer (JSM)",
    busId: "508",
    busName: "Jaisalmer",
    busSlug: "jaisalmer",
    flightIata: "JSA",
    flightName: "Jaisalmer Airport (JSA)",
    state: "Rajasthan"
  },
  {
    city: "Patna",
    aliases: ["patna", "pnbe", "pat", "patliputra"],
    railCode: "PNBE",
    altRailCodes: ["PPTA", "RJPB"],
    railName: "Patna Junction (PNBE)",
    busId: "510",
    busName: "Patna",
    busSlug: "patna",
    flightIata: "PAT",
    flightName: "Jayprakash Narayan Airport (PAT)",
    state: "Bihar"
  },
  {
    city: "Bhubaneswar",
    aliases: ["bhubaneswar", "bhubaneshwar", "bbs", "bbi", "cuttack"],
    railCode: "BBS",
    altRailCodes: ["CTC"],
    railName: "Bhubaneswar (BBS)",
    busId: "512",
    busName: "Bhubaneswar",
    busSlug: "bhubaneswar",
    flightIata: "BBI",
    flightName: "Biju Patnaik International (BBI)",
    state: "Odisha"
  },
  {
    city: "Puri",
    aliases: ["puri", "jagannath puri"],
    railCode: "PURI",
    altRailCodes: [],
    railName: "Puri (PURI)",
    busId: "513",
    busName: "Puri",
    busSlug: "puri",
    flightIata: "BBI",
    flightName: "Biju Patnaik International (BBI)",
    state: "Odisha"
  },
  {
    city: "Guwahati",
    aliases: ["guwahati", "gauhati", "gau", "dispur", "kamakhya"],
    railCode: "GAU",
    altRailCodes: ["KYQ"],
    railName: "Guwahati (GAU)",
    busId: "515",
    busName: "Guwahati",
    busSlug: "guwahati",
    flightIata: "GAU",
    flightName: "Lokpriya Gopinath Bordoloi International (GAU)",
    state: "Assam"
  },
  {
    city: "Shillong",
    aliases: ["shillong", "meghalaya", "shl"],
    railCode: "GAU",
    altRailCodes: [],
    railName: "Guwahati (GAU)",
    busId: "516",
    busName: "Shillong",
    busSlug: "shillong",
    flightIata: "SHL",
    flightName: "Shillong Airport (SHL)",
    state: "Meghalaya"
  },
  {
    city: "Darjeeling",
    aliases: ["darjeeling", "bagdogra", "siliguri", "njp", "ixb", "dj"],
    railCode: "NJP",
    altRailCodes: ["DJ"],
    railName: "New Jalpaiguri (NJP) / Darjeeling (DJ)",
    busId: "540",
    busName: "Darjeeling",
    busSlug: "darjeeling",
    flightIata: "IXB",
    flightName: "Bagdogra Airport (IXB)",
    state: "West Bengal"
  },
  {
    city: "Gangtok",
    aliases: ["gangtok", "sikkim", "pakyong", "pyg"],
    railCode: "NJP",
    altRailCodes: [],
    railName: "New Jalpaiguri (NJP)",
    busId: "541",
    busName: "Gangtok",
    busSlug: "gangtok",
    flightIata: "PYG",
    flightName: "Pakyong Airport (PYG)",
    state: "Sikkim"
  },
  {
    city: "Shimla",
    aliases: ["shimla", "simla", "sml", "slv", "kalka"],
    railCode: "SML",
    altRailCodes: ["KLK"],
    railName: "Shimla (SML) / Kalka (KLK)",
    busId: "501",
    busName: "Shimla",
    busSlug: "shimla",
    flightIata: "SLV",
    flightName: "Shimla Airport (SLV)",
    state: "Himachal Pradesh"
  },
  {
    city: "Manali",
    aliases: ["manali", "kullu", "kuu"],
    railCode: "CDG",
    altRailCodes: [],
    railName: "Chandigarh (CDG)",
    busId: "502",
    busName: "Manali",
    busSlug: "manali",
    flightIata: "KUU",
    flightName: "Kullu Manali Airport (KUU)",
    state: "Himachal Pradesh"
  },
  {
    city: "Rishikesh",
    aliases: ["rishikesh", "haridwar", "hw", "ynrk", "rksh"],
    railCode: "YNRK",
    altRailCodes: ["HW", "RKSH"],
    railName: "Yog Nagari Rishikesh (YNRK) / Haridwar (HW)",
    busId: "503",
    busName: "Rishikesh",
    busSlug: "rishikesh",
    flightIata: "DED",
    flightName: "Dehradun Jolly Grant Airport (DED)",
    state: "Uttarakhand"
  },
  {
    city: "Dehradun",
    aliases: ["dehradun", "mussoorie", "ddn", "ded"],
    railCode: "DDN",
    altRailCodes: [],
    railName: "Dehradun (DDN)",
    busId: "505",
    busName: "Dehradun",
    busSlug: "dehradun",
    flightIata: "DED",
    flightName: "Dehradun Jolly Grant Airport (DED)",
    state: "Uttarakhand"
  },
  {
    city: "Srinagar",
    aliases: ["srinagar", "kashmir", "sxr", "sina", "gulmarg", "pahalgam"],
    railCode: "SINA",
    altRailCodes: ["JAT"],
    railName: "Srinagar Kashmir (SINA) / Jammu Tawi (JAT)",
    busId: "537",
    busName: "Srinagar",
    busSlug: "srinagar",
    flightIata: "SXR",
    flightName: "Sheikh ul-Alam International (SXR)",
    state: "Jammu and Kashmir"
  },
  {
    city: "Jammu",
    aliases: ["jammu", "katra", "vaishno devi", "svdk", "jat", "ixj"],
    railCode: "JAT",
    altRailCodes: ["SVDK"],
    railName: "Jammu Tawi (JAT) / SMVD Katra (SVDK)",
    busId: "535",
    busName: "Jammu",
    busSlug: "jammu",
    flightIata: "IXJ",
    flightName: "Jammu Civil Enclave (IXJ)",
    state: "Jammu and Kashmir"
  },
  {
    city: "Leh",
    aliases: ["leh", "ladakh", "ixl", "pangong", "nubra"],
    railCode: "JAT",
    altRailCodes: [],
    railName: "Jammu Tawi (JAT)",
    busId: "538",
    busName: "Leh",
    busSlug: "leh",
    flightIata: "IXL",
    flightName: "Kushok Bakula Rimpochee Airport (IXL)",
    state: "Ladakh"
  },
  {
    city: "Ranchi",
    aliases: ["ranchi", "rnc", "ixr", "hatia"],
    railCode: "RNC",
    altRailCodes: ["HTE"],
    railName: "Ranchi (RNC)",
    busId: "511",
    busName: "Ranchi",
    busSlug: "ranchi",
    flightIata: "IXR",
    flightName: "Birsa Munda Airport (IXR)",
    state: "Jharkhand"
  },
  {
    city: "Raipur",
    aliases: ["raipur", "rpr", "r"],
    railCode: "R",
    altRailCodes: [],
    railName: "Raipur Junction (R)",
    busId: "526",
    busName: "Raipur",
    busSlug: "raipur",
    flightIata: "RPR",
    flightName: "Swami Vivekananda Airport (RPR)",
    state: "Chhattisgarh"
  },
  {
    city: "Nagpur",
    aliases: ["nagpur", "ngp", "nag", "orange city"],
    railCode: "NGP",
    altRailCodes: [],
    railName: "Nagpur Junction (NGP)",
    busId: "144",
    busName: "Nagpur",
    busSlug: "nagpur",
    flightIata: "NAG",
    flightName: "Dr. Babasaheb Ambedkar International (NAG)",
    state: "Maharashtra"
  },
  {
    city: "Nashik",
    aliases: ["nashik", "nasik", "nk", "isk"],
    railCode: "NK",
    altRailCodes: [],
    railName: "Nashik Road (NK)",
    busId: "522",
    busName: "Nashik",
    busSlug: "nashik",
    flightIata: "ISK",
    flightName: "Nashik Airport (ISK)",
    state: "Maharashtra"
  },
  {
    city: "Shirdi",
    aliases: ["shirdi", "sainagar shirdi", "snsi", "sag", "kopargaon"],
    railCode: "SNSI",
    altRailCodes: ["KPG"],
    railName: "Sainagar Shirdi (SNSI)",
    busId: "521",
    busName: "Shirdi",
    busSlug: "shirdi",
    flightIata: "SAG",
    flightName: "Shirdi Airport (SAG)",
    state: "Maharashtra"
  },
  {
    city: "Port Blair",
    aliases: ["port blair", "andaman", "havelock", "ixz"],
    railCode: "MAS",
    altRailCodes: [],
    railName: "Chennai Transit (MAS)",
    busId: "123",
    busName: "Port Blair",
    busSlug: "port-blair",
    flightIata: "IXZ",
    flightName: "Veer Savarkar International (IXZ)",
    state: "Andaman and Nicobar"
  },
  {
    city: "Dubai",
    aliases: ["dubai", "dxb", "uae", "emirates"],
    railCode: "NDLS",
    altRailCodes: [],
    railName: "Delhi Transit (NDLS)",
    busId: "145",
    busName: "Dubai",
    busSlug: "dubai",
    flightIata: "DXB",
    flightName: "Dubai International Airport (DXB)",
    state: "UAE"
  },
  {
    city: "Singapore",
    aliases: ["singapore", "sin", "changi"],
    railCode: "MAS",
    altRailCodes: [],
    railName: "Chennai Transit (MAS)",
    busId: "123",
    busName: "Singapore",
    busSlug: "singapore",
    flightIata: "SIN",
    flightName: "Singapore Changi Airport (SIN)",
    state: "Singapore"
  },
  {
    city: "Bangkok",
    aliases: ["bangkok", "bkk", "thailand", "suvarnabhumi"],
    railCode: "CCU",
    altRailCodes: [],
    railName: "Kolkata Transit (CCU)",
    busId: "133",
    busName: "Bangkok",
    busSlug: "bangkok",
    flightIata: "BKK",
    flightName: "Suvarnabhumi Airport (BKK)",
    state: "Thailand"
  },
  {
    city: "London",
    aliases: ["london", "lhr", "heathrow", "uk"],
    railCode: "NDLS",
    altRailCodes: [],
    railName: "Delhi Transit (NDLS)",
    busId: "145",
    busName: "London",
    busSlug: "london",
    flightIata: "LHR",
    flightName: "London Heathrow Airport (LHR)",
    state: "UK"
  },
  {
    city: "Paris",
    aliases: ["paris", "cdg", "france"],
    railCode: "NDLS",
    altRailCodes: [],
    railName: "Delhi Transit (NDLS)",
    busId: "145",
    busName: "Paris",
    busSlug: "paris",
    flightIata: "CDG",
    flightName: "Paris Charles de Gaulle (CDG)",
    state: "France"
  },
  {
    city: "New York",
    aliases: ["new york", "jfk", "nyc"],
    railCode: "NDLS",
    altRailCodes: [],
    railName: "Delhi Transit (NDLS)",
    busId: "145",
    busName: "New York",
    busSlug: "new-york",
    flightIata: "JFK",
    flightName: "John F. Kennedy International (JFK)",
    state: "USA"
  },
  {
    city: "Bali",
    aliases: ["bali", "dps", "denpasar", "indonesia"],
    railCode: "MAS",
    altRailCodes: [],
    railName: "Chennai Transit (MAS)",
    busId: "123",
    busName: "Bali",
    busSlug: "bali",
    flightIata: "DPS",
    flightName: "Ngurah Rai International (DPS)",
    state: "Indonesia"
  },
  {
    city: "Kuala Lumpur",
    aliases: ["kuala lumpur", "kul", "malaysia"],
    railCode: "MAS",
    altRailCodes: [],
    railName: "Chennai Transit (MAS)",
    busId: "123",
    busName: "Kuala Lumpur",
    busSlug: "kuala-lumpur",
    flightIata: "KUL",
    flightName: "Kuala Lumpur International (KUL)",
    state: "Malaysia"
  },
  {
    city: "Male",
    aliases: ["male", "maldives", "mle"],
    railCode: "COK",
    altRailCodes: [],
    railName: "Cochin Transit (COK)",
    busId: "146",
    busName: "Male",
    busSlug: "male",
    flightIata: "MLE",
    flightName: "Velana International (MLE)",
    state: "Maldives"
  },
  {
    city: "Colombo",
    aliases: ["colombo", "sri lanka", "cmb"],
    railCode: "MAS",
    altRailCodes: [],
    railName: "Chennai Transit (MAS)",
    busId: "123",
    busName: "Colombo",
    busSlug: "colombo",
    flightIata: "CMB",
    flightName: "Bandaranaike International (CMB)",
    state: "Sri Lanka"
  },
  {
    city: "Kathmandu",
    aliases: ["kathmandu", "nepal", "ktm"],
    railCode: "NDLS",
    altRailCodes: [],
    railName: "Delhi Transit (NDLS)",
    busId: "145",
    busName: "Kathmandu",
    busSlug: "kathmandu",
    flightIata: "KTM",
    flightName: "Tribhuvan International (KTM)",
    state: "Nepal"
  }
];

document.addEventListener("DOMContentLoaded", () => {
  renderTransportHeader();
  const transportContainer = document.getElementById("transport-cards-container");
  if (transportContainer) {
    transportContainer.innerHTML = '<div class="p-4 text-center text-muted"><span class="spinner-border spinner-border-sm me-2"></span>Loading transport options for your trip…</div>';
  }
  loadTransportFromApi();
  initTransportMap();
  document.addEventListener("tm:synced", () => {
    renderTransportHeader();
    loadTransportFromApi();
    initTransportMap();
  });

  // Mode filter pills
  document.querySelectorAll(".tm-transport-filter-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tm-transport-filter-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentTransportFilter = btn.dataset.mode;
      renderTransportCards();
    });
  });

  // Sorting control
  const sortSelect = document.getElementById("transport-sort-select");
  if (sortSelect) {
    sortSelect.addEventListener("change", (e) => {
      currentSortBy = e.target.value;
      renderTransportCards();
    });
  }
});

/**
 * Intelligent Transit Hub Resolver
 * Matches city names, station codes, airport codes, and aliases.
 */
function tmResolveTransitCodes(rawLocation) {
  if (!rawLocation) return null;
  const input = String(rawLocation).trim();
  const lower = input.toLowerCase();

  // 1. Exact alias or substring match in catalog
  for (const entry of TM_TRANSIT_HUBS) {
    if (entry.aliases.some(alias => lower === alias || lower.includes(alias) || alias.includes(lower))) {
      return entry;
    }
  }

  // 2. Direct code extraction (if rawLocation explicitly has station/airport code like "NDLS", "BOM")
  const upperWords = input.match(/\b[A-Z]{3,4}\b/g) || [];
  for (const code of upperWords) {
    const match = TM_TRANSIT_HUBS.find(h =>
      h.railCode === code || h.flightIata === code || (h.altRailCodes && h.altRailCodes.includes(code))
    );
    if (match) return match;
  }

  // 3. Clean dynamic fallback for unmapped custom locations
  const cleanCity = input.split(",")[0].replace(/\([^)]*\)/g, "").trim() || input;
  const slug = cleanCity.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const alphaOnly = cleanCity.replace(/[^a-zA-Z]/g, "").toUpperCase();
  const pseudoRail = alphaOnly.slice(0, 4) || "STN";
  const pseudoIata = alphaOnly.slice(0, 3) || "AAA";

  return {
    city: cleanCity,
    aliases: [lower],
    railCode: pseudoRail,
    altRailCodes: [],
    railName: `${cleanCity} Station`,
    busId: "",
    busName: cleanCity,
    busSlug: slug,
    flightIata: pseudoIata,
    flightName: `${cleanCity} Airport`,
    state: "",
    isDynamic: true
  };
}

/**
 * Normalizes travel dates for booking systems.
 * If unset or in the past, defaults to a realistic future date (+7 days).
 */
function tmGetValidDates(trip) {
  let d = null;
  if (trip?.startDate) {
    const parsed = new Date(trip.startDate);
    if (!isNaN(parsed.getTime())) d = parsed;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (!d || d < today) {
    d = new Date();
    d.setDate(d.getDate() + 7);
  }

  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const mmm = monthNames[d.getMonth()];

  return {
    iso: `${yyyy}-${mm}-${dd}`,                 // "2026-11-25"
    dojDigits: `${yyyy}${mm}${dd}`,             // "20261125" for redRail
    redbusDate: `${dd}-${mmm}-${yyyy}`,         // "25-Nov-2026" for redBus
    display: `${mmm} ${d.getDate()}, ${yyyy}`  // "Nov 25, 2026"
  };
}

/**
 * Builds pre-filled redRail URL with Indian Railways station codes and date.
 */
function tmRedrailUrl(fromHub, toHub, dates) {
  const srcCode = fromHub.railCode;
  const dstCode = toHub.railCode;
  const doj = dates.dojDigits;
  const dateIso = dates.iso;
  const srcName = fromHub.railName || fromHub.city;
  const dstName = toHub.railName || toHub.city;

  const params = new URLSearchParams({
    src: srcCode,
    dst: dstCode,
    doj: doj,
    srcName: srcName,
    dstName: dstName,
    fromCityName: fromHub.city,
    toCityName: toHub.city,
    fromCity: srcCode,
    toCity: dstCode,
    date: dateIso,
    journeyDate: dateIso
  });

  return `https://www.redbus.in/railways/search?${params.toString()}`;
}

/**
 * Builds pre-filled redBus bus tickets URL with numeric city IDs, slugs, and date.
 */
function tmRedbusBusUrl(fromHub, toHub, dates) {
  const srcSlug = fromHub.busSlug || fromHub.slug;
  const dstSlug = toHub.busSlug || toHub.slug;
  const basePath = `https://www.redbus.in/bus-tickets/${srcSlug}-to-${dstSlug}`;

  const params = new URLSearchParams();
  params.set("fromCityName", fromHub.busName || fromHub.city);
  if (fromHub.busId) params.set("fromCityId", fromHub.busId);
  params.set("toCityName", toHub.busName || toHub.city);
  if (toHub.busId) params.set("toCityId", toHub.busId);
  params.set("onward", dates.redbusDate);
  params.set("doj", dates.redbusDate);
  params.set("src", srcSlug);
  params.set("dst", dstSlug);
  params.set("busType", "any");

  return `${basePath}?${params.toString()}`;
}

/**
 * Builds pre-filled Booking.com Flights URL with 3-letter IATA airport codes,
 * departure date, and traveler count.
 */
function tmBookingFlightsUrl(fromHub, toHub, dates, travelers = 1) {
  const fromIata = fromHub.flightIata;
  const toIata = toHub.flightIata;
  const dateIso = dates.iso;
  const adults = Math.max(1, parseInt(travelers, 10) || 1);

  if (fromIata && toIata && fromIata !== "AAA" && toIata !== "AAA") {
    // Canonical Booking.com flight deep link
    const basePath = `https://flights.booking.com/flights/${fromIata}.AIRPORT-${toIata}.AIRPORT/`;
    const params = new URLSearchParams({
      type: "ONEWAY",
      adults: String(adults),
      cabinClass: "ECONOMY",
      children: "",
      depart: dateIso,
      sort: "BEST",
      from: `${fromIata}.AIRPORT`,
      to: `${toIata}.AIRPORT`
    });
    return `${basePath}?${params.toString()}`;
  }

  // Fallback if IATA codes could not be matched
  const params = new URLSearchParams({
    from: fromHub.city,
    to: toHub.city,
    depart: dateIso,
    adults: String(adults),
    type: "ONEWAY",
    cabinClass: "ECONOMY"
  });
  return `https://flights.booking.com/flights/?${params.toString()}`;
}

function tmUberUrl(from, to) {
  const params = new URLSearchParams();
  params.set("action", "setPickup");
  params.set("pickup[formatted_address]", from);
  params.set("dropoff[formatted_address]", to);
  return `https://m.uber.com/ul/?${params.toString()}`;
}

function tmRapidoUrl(from, to) {
  const params = new URLSearchParams({ api: "1", origin: from, destination: to, travelmode: "driving" });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function tmSelfDriveMapUrl(trip, from, to) {
  const stops = [];
  (trip?.days || []).forEach(day => (day.stops || []).forEach(stop => {
    const lat = Number(stop.lat), lng = Number(stop.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) stops.push(`${lat},${lng}`);
  }));
  const selectedHotel = String(trip?.accommodation?.name || "").trim();
  const mapDestination = selectedHotel ? `${selectedHotel}, ${to}` : to;
  const params = new URLSearchParams({ api: "1", origin: from, destination: mapDestination, travelmode: "driving" });
  if (stops.length) params.set("waypoints", stops.slice(0, 8).join("|"));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function tmTripRoute(item) {
  const trip = window.TravelMateStore?.getActiveTrip?.() || {};
  const clean = value => String(value || "").trim();
  const invalid = value => !value || /^(undefined|null|-)$/i.test(value.trim());
  let from = clean(trip.origin);
  let to = clean(trip.destination);
  if (invalid(from)) from = "Bengaluru";
  if (invalid(to)) to = "Mysuru";
  return { trip, from, to };
}

function tmOpenExternal(url) {
  if (!url) return false;
  const opened = window.open(url, "_blank", "noopener,noreferrer");
  if (!opened) {
    alert("Your browser blocked the new tab. Please allow pop-ups for TravelMate and click again.");
    return false;
  }
  return true;
}

function renderTransportHeader() {
  const trip = window.TravelMateStore?.getActiveTrip?.() || {};
  const from = trip.origin || "Bengaluru";
  const to = trip.destination || "Mysuru";

  const fromHub = tmResolveTransitCodes(from);
  const toHub = tmResolveTransitCodes(to);
  const dates = tmGetValidDates(trip);

  const headerOrigin = document.getElementById("tr-header-origin");
  const headerDest = document.getElementById("tr-header-dest");
  const headerDate = document.getElementById("tr-header-date");
  const headerTravelers = document.getElementById("tr-header-travelers");

  if (headerOrigin) {
    headerOrigin.textContent = fromHub ? fromHub.city : from;
  }
  if (headerDest) {
    headerDest.textContent = toHub ? toHub.city : to;
  }
  if (headerDate) {
    headerDate.textContent = dates.display;
  }
  if (headerTravelers) {
    headerTravelers.textContent = `${trip.travelers || 1} Travelers`;
  }

  // Pre-fill route indicator badge bar
  let indicatorEl = document.getElementById("tm-transit-codes-banner");
  if (!indicatorEl) {
    const bannerContainer = document.querySelector(".bg-white.border-bottom.py-3 .container-xl");
    if (bannerContainer) {
      indicatorEl = document.createElement("div");
      indicatorEl.id = "tm-transit-codes-banner";
      indicatorEl.className = "mt-3 pt-2 border-top d-flex flex-wrap gap-2 align-items-center text-muted small";
      bannerContainer.appendChild(indicatorEl);
    }
  }

  if (indicatorEl && fromHub && toHub) {
    indicatorEl.innerHTML = `
      <span class="fw-semibold text-dark"><i class="bi bi-link-45deg text-primary"></i> Pre-filled Direct Links:</span>
      <span class="badge bg-danger-subtle text-danger border border-danger-subtle"><i class="bi bi-train-front me-1"></i> redRail: ${fromHub.railCode} ➔ ${toHub.railCode}</span>
      <span class="badge bg-danger-subtle text-danger border border-danger-subtle"><i class="bi bi-bus-front me-1"></i> redBus: ${fromHub.busName} ➔ ${toHub.busName}</span>
      <span class="badge bg-info-subtle text-dark border border-info-subtle"><i class="bi bi-airplane me-1"></i> Flights: ${fromHub.flightIata} ➔ ${toHub.flightIata}</span>
      <span class="ms-auto text-success fw-semibold"><i class="bi bi-check2-circle me-1"></i> Station & Bus Codes Pre-configured</span>
    `;
  }
}

function renderTransportCards() {
  const container = document.getElementById("transport-cards-container");
  if (!container) return;
  const trip = window.TravelMateStore?.getActiveTrip?.() || {};
  const itemsSource = Array.isArray(TRAVELMATE_DATA.transports) ? TRAVELMATE_DATA.transports : [];
  
  const from = trip.origin || "Bengaluru";
  const to = trip.destination || "Mysuru";
  const fromHub = tmResolveTransitCodes(from);
  const toHub = tmResolveTransitCodes(to);

  let items = itemsSource.map(item => ({
    ...item,
    origin: fromHub ? fromHub.city : from,
    destination: toHub ? toHub.city : to
  }));

  // Filter by Mode
  if (currentTransportFilter !== "all") {
    items = items.filter(i => i.mode === currentTransportFilter);
  }

  // Sort
  if (currentSortBy === "cheapest") {
    items.sort((a, b) => a.price - b.price);
  } else if (currentSortBy === "fastest") {
    items.sort((a, b) => parseDurationToMinutes(a.duration) - parseDurationToMinutes(b.duration));
  }

  const countEl = document.getElementById("transport-results-count");
  if (countEl) countEl.textContent = `${items.length} options found`;

  if (items.length === 0) {
    container.innerHTML = `
      <div class="p-5 text-center bg-white rounded-3 border">
        <i class="bi bi-slash-circle text-muted fs-1 mb-2"></i>
        <h5 class="fw-bold">No transport options match this filter</h5>
        <p class="text-muted small">Select another travel mode filter above or adjust your search.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = items.map(tr => {
    // Mode-specific code badges
    let originCodeBadge = "";
    let destCodeBadge = "";
    if (tr.mode === "train" && fromHub && toHub) {
      originCodeBadge = `<span class="badge bg-secondary-subtle text-dark font-monospace">${fromHub.railCode}</span>`;
      destCodeBadge = `<span class="badge bg-secondary-subtle text-dark font-monospace">${toHub.railCode}</span>`;
    } else if (tr.mode === "flight" && fromHub && toHub) {
      originCodeBadge = `<span class="badge bg-info-subtle text-dark font-monospace">${fromHub.flightIata}</span>`;
      destCodeBadge = `<span class="badge bg-info-subtle text-dark font-monospace">${toHub.flightIata}</span>`;
    } else if (tr.mode === "bus" && fromHub && toHub) {
      originCodeBadge = `<span class="badge bg-light text-muted border">${fromHub.busName}</span>`;
      destCodeBadge = `<span class="badge bg-light text-muted border">${toHub.busName}</span>`;
    }

    return `
      <div class="tm-card p-4 mb-3 tm-card-hover-elevate">
        <div class="row align-items-center g-3">
          <!-- Provider Info -->
          <div class="col-md-3">
            <div class="d-flex align-items-center gap-2 mb-1">
              <span class="rounded-2 p-2 bg-light text-primary fs-5"><i class="bi ${tr.icon}"></i></span>
              <div>
                <span class="badge bg-secondary-subtle text-dark small">${tr.modeName}</span>
                <h6 class="fw-bold text-dark m-0 mt-1">${tr.provider}</h6>
              </div>
            </div>
            <small class="text-muted">${tr.number}</small>
          </div>

          <!-- Schedule & Duration -->
          <div class="col-md-5">
            <div class="d-flex align-items-center justify-content-between text-center">
              <div class="text-start" style="min-width: 80px;">
                <h5 class="fw-bold m-0 text-dark">${tr.depTime}</h5>
                <div class="small fw-semibold text-secondary">${tr.origin}</div>
                ${originCodeBadge ? `<div class="mt-1">${originCodeBadge}</div>` : ''}
              </div>

              <div class="px-2 flex-grow-1">
                <small class="text-muted d-block fw-semibold">${tr.duration}</small>
                <div class="position-relative my-1">
                  <hr class="m-0 border-secondary">
                  <i class="bi bi-arrow-right position-absolute top-50 start-50 translate-middle bg-white px-1 text-muted" style="font-size:0.75rem;"></i>
                </div>
                <small class="badge bg-light text-success border border-success-subtle">${tr.priceCategory}</small>
              </div>

              <div class="text-end" style="min-width: 80px;">
                <h5 class="fw-bold m-0 text-dark">${tr.arrTime}</h5>
                <div class="small fw-semibold text-secondary">${tr.destination}</div>
                ${destCodeBadge ? `<div class="mt-1">${destCodeBadge}</div>` : ''}
              </div>
            </div>
          </div>

          <!-- Price & Action -->
          <div class="col-md-4 text-md-end border-start-md ps-md-4">
            <div class="d-flex flex-md-column justify-content-between align-items-md-end align-items-center">
              <div>
                <span class="small text-muted d-block">ESTIMATED FARE</span>
                <h4 class="fw-bold text-dark m-0">₹${Number(tr.price || 0).toLocaleString()} <span class="fs-6 text-muted fw-normal">/ person</span></h4>
                <small class="text-success fw-semibold"><i class="bi bi-check-circle-fill"></i> ${tr.availability}</small>
              </div>

              <div class="mt-md-3 w-100">
                ${renderTransportActions(tr, fromHub, toHub)}
              </div>
            </div>
          </div>
        </div>

        <!-- Features chips -->
        <div class="d-flex flex-wrap gap-2 pt-3 mt-3 border-top align-items-center">
          ${(tr.features || []).map(f => `<span class="badge bg-light text-secondary border small"><i class="bi bi-dot"></i> ${f}</span>`).join("")}
          <span class="badge bg-success-subtle text-success border border-success-subtle ms-auto small">
            <i class="bi bi-lightning-charge"></i> Instant Pre-filled Search
          </span>
        </div>
      </div>
    `;
  }).join("");
}

function parseDurationToMinutes(durationStr) {
  let minutes = 0;
  const hMatch = String(durationStr || "").match(/(\d+)h/);
  const mMatch = String(durationStr || "").match(/(\d+)m/);
  if (hMatch) minutes += parseInt(hMatch[1], 10) * 60;
  if (mMatch) minutes += parseInt(mMatch[1], 10);
  return minutes || 60;
}

function renderTransportActions(tr, fromHub, toHub) {
  if (tr.mode === "train") {
    return `
      <div class="text-md-end w-100">
        <button type="button" class="tm-btn tm-btn-accent tm-btn-sm w-100" onclick="openTransportPlatform('${tr.id}')">
          <i class="bi bi-train-front me-1"></i> Book on redRail
        </button>
        <div class="text-muted small mt-1 text-md-end" style="font-size:0.75rem;">
          <i class="bi bi-check2 text-success"></i> Auto-fills <strong>${fromHub ? fromHub.railCode : 'Origin'} ➔ ${toHub ? toHub.railCode : 'Dest'}</strong>
        </div>
      </div>
    `;
  }
  if (tr.mode === "bus") {
    return `
      <div class="text-md-end w-100">
        <button type="button" class="tm-btn tm-btn-accent tm-btn-sm w-100" onclick="openTransportPlatform('${tr.id}')">
          <i class="bi bi-bus-front me-1"></i> Book on redBus
        </button>
        <div class="text-muted small mt-1 text-md-end" style="font-size:0.75rem;">
          <i class="bi bi-check2 text-success"></i> Auto-fills <strong>${fromHub ? fromHub.busName : 'Origin'} ➔ ${toHub ? toHub.busName : 'Dest'}</strong>
        </div>
      </div>
    `;
  }
  if (tr.mode === "flight") {
    return `
      <div class="text-md-end w-100">
        <button type="button" class="tm-btn tm-btn-accent tm-btn-sm w-100" onclick="openTransportPlatform('${tr.id}')">
          <i class="bi bi-airplane me-1"></i> Search Flights
        </button>
        <div class="text-muted small mt-1 text-md-end" style="font-size:0.75rem;">
          <i class="bi bi-check2 text-success"></i> Booking.com (${fromHub ? fromHub.flightIata : 'DEP'} ➔ ${toHub ? toHub.flightIata : 'ARR'})
        </div>
      </div>
    `;
  }
  if (tr.mode === "car") {
    return `
      <div class="d-flex flex-column gap-2 w-100">
        <div class="d-flex gap-2 justify-content-md-end">
          <button type="button" class="tm-btn tm-btn-accent tm-btn-sm flex-fill" onclick="openCabPlatform('${tr.id}','uber')"><i class="bi bi-car-front me-1"></i> Uber</button>
          <button type="button" class="tm-btn tm-btn-outline tm-btn-sm flex-fill" onclick="openCabPlatform('${tr.id}','rapido')"><i class="bi bi-bicycle me-1"></i> Rapido</button>
        </div>
        <button type="button" class="tm-btn tm-btn-outline tm-btn-sm w-100" onclick="openSelfDriveMap('${tr.id}')"><i class="bi bi-map me-1"></i> Open Google Maps Route</button>
      </div>
    `;
  }
  return `<button type="button" class="tm-btn tm-btn-accent tm-btn-sm w-100" onclick="openTransportPlatform('${tr.id}')">Continue</button>`;
}

function openTransportPlatform(transportId) {
  const item = TRAVELMATE_DATA.transports.find(t => t.id === transportId);
  if (!item) return;
  const { trip, from, to } = tmTripRoute(item);
  const fromHub = tmResolveTransitCodes(from);
  const toHub = tmResolveTransitCodes(to);
  const dates = tmGetValidDates(trip);
  const travelers = trip.travelers || 1;

  if (item.mode === "train") {
    tmOpenExternal(tmRedrailUrl(fromHub, toHub, dates));
  } else if (item.mode === "bus") {
    tmOpenExternal(tmRedbusBusUrl(fromHub, toHub, dates));
  } else if (item.mode === "flight") {
    tmOpenExternal(tmBookingFlightsUrl(fromHub, toHub, dates, travelers));
  }
}

function openCabPlatform(transportId, provider) {
  const item = TRAVELMATE_DATA.transports.find(t => t.id === transportId);
  if (!item) return;
  const { from, to } = tmTripRoute(item);
  if (provider === "uber") {
    tmOpenExternal(tmUberUrl(from, to));
  } else {
    tmOpenExternal(tmRapidoUrl(from, to));
  }
}

function openSelfDriveMap(transportId) {
  const item = TRAVELMATE_DATA.transports.find(t => t.id === transportId);
  if (!item) return;
  const { trip, from, to } = tmTripRoute(item);
  tmOpenExternal(tmSelfDriveMapUrl(trip, from, to));
}

async function loadTransportFromApi() {
  const requestVersion = ++transportLoadVersion;
  if (!window.TravelMateStore?.getTransports) return;
  try {
    const trip = window.TravelMateStore?.getActiveTrip?.() || {};
    // Load provider options independent of route, then bind to active trip
    const res = await window.TravelMateStore.getTransports({ limit: 50 });
    if (requestVersion !== transportLoadVersion) return;
    const items = res?.items || res;
    TRAVELMATE_DATA.transports = Array.isArray(items) ? items : [];
    renderTransportCards();
  } catch (err) {
    if (requestVersion !== transportLoadVersion) return;
    console.error("Could not load transport options for active trip:", err);
    renderTransportCards();
  }
}

// Modal route changer helpers
function openRouteModal() {
  const trip = window.TravelMateStore?.getActiveTrip?.() || {};
  const fromEl = document.getElementById("route-modal-from");
  const toEl = document.getElementById("route-modal-to");
  const dateEl = document.getElementById("route-modal-date");
  if (fromEl) fromEl.value = trip.origin || "Bengaluru";
  if (toEl) toEl.value = trip.destination || "Mysuru";
  if (dateEl) {
    const dates = tmGetValidDates(trip);
    dateEl.value = dates.iso;
  }
}

function applyRouteModal() {
  const fromVal = document.getElementById("route-modal-from")?.value?.trim();
  const toVal = document.getElementById("route-modal-to")?.value?.trim();
  const dateVal = document.getElementById("route-modal-date")?.value?.trim();
  if (!fromVal || !toVal) return;

  const trip = window.TravelMateStore?.getActiveTrip?.() || {};
  trip.origin = fromVal;
  trip.destination = toVal;
  if (dateVal) trip.startDate = dateVal;

  if (window.TravelMateStore?.updateTrip && trip.id) {
    window.TravelMateStore.updateTrip(trip.id, trip);
  } else if (window.TravelMateStore?.saveTrip) {
    window.TravelMateStore.saveTrip(trip);
  }
  
  const modalEl = document.getElementById("tmRouteModal");
  if (modalEl && window.bootstrap?.Modal) {
    const inst = bootstrap.Modal.getInstance(modalEl);
    if (inst) inst.hide();
  }

  renderTransportHeader();
  renderTransportCards();
  initTransportMap();
}

/**
 * Route Map & Google Maps Integration
 */
const TM_CITY_COORDINATES = {
  "bengaluru": [12.9716, 77.5946],
  "bangalore": [12.9716, 77.5946],
  "mysuru": [12.2958, 76.6394],
  "mysore": [12.2958, 76.6394],
  "new delhi": [28.6139, 77.2090],
  "delhi": [28.6139, 77.2090],
  "mumbai": [19.0760, 72.8777],
  "hyderabad": [17.3850, 78.4867],
  "chennai": [13.0827, 80.2707],
  "kolkata": [22.5726, 88.3639],
  "pune": [18.5204, 73.8567],
  "ahmedabad": [23.0225, 72.5714],
  "jaipur": [26.9124, 75.7873],
  "goa": [15.2993, 74.1240],
  "tirupati": [13.6288, 79.4192],
  "agra": [27.1767, 78.0081],
  "varanasi": [25.3176, 82.9739],
  "kochi": [9.9312, 76.2673],
  "visakhapatnam": [17.6868, 83.2185],
  "vijayawada": [16.5062, 80.6480],
  "udaipur": [24.5854, 73.7125],
  "amritsar": [31.6340, 74.8723],
  "chandigarh": [30.7333, 76.7794],
  "dubai": [25.2048, 55.2708]
};

async function initTransportMap() {
  const container = document.getElementById("transport-map-container");
  if (!container) return;

  const trip = window.TravelMateStore?.getActiveTrip?.() || {};
  const from = trip.origin || "Bengaluru";
  const to = trip.destination || "Mysuru";

  const fromHub = tmResolveTransitCodes(from);
  const toHub = tmResolveTransitCodes(to);
  const fromCity = fromHub ? fromHub.city : from;
  const toCity = toHub ? toHub.city : to;

  // Direct Google Maps Directions link
  const gmapsLink = document.getElementById("tr-gmaps-link");
  if (gmapsLink) {
    const originParam = encodeURIComponent(fromCity);
    const destParam = encodeURIComponent(toCity);
    gmapsLink.href = `https://www.google.com/maps/dir/?api=1&origin=${originParam}&destination=${destParam}&travelmode=driving`;
  }

  // Lookup coordinates for distance calculation and map markers
  const fromKey = fromCity.toLowerCase().trim();
  const toKey = toCity.toLowerCase().trim();
  const fromCoord = TM_CITY_COORDINATES[fromKey] || [12.9716, 77.5946];
  const toCoord = TM_CITY_COORDINATES[toKey] || [12.2958, 76.6394];

  // Calculate highway distance with road winding factor
  const dLat = (toCoord[0] - fromCoord[0]) * Math.PI / 180;
  const dLon = (toCoord[1] - fromCoord[1]) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(fromCoord[0] * Math.PI / 180) * Math.cos(toCoord[0] * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const roadKm = Math.round(Math.max(10, 6371 * c * 1.25));

  const driveHours = Math.floor(roadKm / 55);
  const driveMins = Math.round((roadKm % 55) / 55 * 60);

  const distEl = document.getElementById("tr-route-distance");
  const durEl = document.getElementById("tr-route-duration");
  if (distEl) distEl.textContent = `~${roadKm} km (by road)`;
  if (durEl) durEl.textContent = driveHours > 0 ? `~${driveHours} hrs ${driveMins} mins` : `~${driveMins} mins`;

  if (window.TMMap) {
    try {
      const midLat = (fromCoord[0] + toCoord[0]) / 2;
      const midLng = (fromCoord[1] + toCoord[1]) / 2;
      await window.TMMap.init("transport-map-container", [midLat, midLng], 7);
      window.TMMap.showStops([
        { id: "origin", lat: fromCoord[0], lng: fromCoord[1], label: "1", html: `<strong>${fromCity}</strong><br>Origin` },
        { id: "dest", lat: toCoord[0], lng: toCoord[1], label: "2", html: `<strong>${toCity}</strong><br>Destination` }
      ]);
    } catch (err) {
      console.warn("Transport route map initialization error:", err);
    }
  }
}

// Window global exports
window.openTransportPlatform = openTransportPlatform;
window.openCabPlatform = openCabPlatform;
window.openSelfDriveMap = openSelfDriveMap;
window.loadTransportFromApi = loadTransportFromApi;
window.initTransportMap = initTransportMap;
window.tmResolveTransitCodes = tmResolveTransitCodes;
window.tmRedrailUrl = tmRedrailUrl;
window.tmRedbusBusUrl = tmRedbusBusUrl;
window.tmBookingFlightsUrl = tmBookingFlightsUrl;
window.TM_TRANSIT_HUBS = TM_TRANSIT_HUBS;
window.openRouteModal = openRouteModal;
window.applyRouteModal = applyRouteModal;

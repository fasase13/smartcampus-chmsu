const ACADEMIC_COLLEGE_OFFICES = [
  "Office of the Dean",
  "Department Chairperson's Office",
  "Faculty Room",
  "College Laboratory / Technical Office",
];

const EXTERNAL_CAMPUS_ADMIN_OFFICES = [
  "Office of the Executive Director",
  "Records Management Office (RMO)",
  "Office of the Registrar",
  "Guidance Services Office",
  "Office for Student Affairs and Services (OSAS)",
  "Library Services",
  "Accounting / Cashier's Office",
  "ICT / MIS Unit",
];

/**
 * Single source of truth for all 4 CHMSU campuses:
 * - academicColleges: Offered degree programs (for students) & standard college offices (for non-students)
 * - administrativeDepartments: Non-student divisions & offices
 */
export const CHMSU_CAMPUS_DIRECTORY = {
  talisay: {
    academicColleges: {
      "College of Arts and Sciences (CAS)": [
        "BA in English Language",
        "BA in Social Science",
        "Bachelor of Public Administration",
        "BS in Applied Mathematics",
        "BS in Psychology",
      ],
      "College of Business Management and Accountancy (CBMA)": [
        "BS in Hospitality Management",
      ],
      "College of Computer Studies (CCS)": ["BS in Information Systems"],
      "College of Education (COED)": [
        "Bachelor of Elementary Education",
        "Bachelor of Physical Education",
        "Bachelor of Secondary Education (English)",
        "Bachelor of Secondary Education (Filipino)",
        "Bachelor of Secondary Education (Mathematics)",
        "Bachelor of Secondary Education (Science)",
        "Bachelor of Technology and Livelihood Education (Home Economics)",
        "Bachelor of Technology and Livelihood Education (Industrial Arts)",
      ],
      "College of Engineering (COE)": ["BS in Civil Engineering"],
      "College of Industrial Technology (CIT)": [
        "Bachelor of Industrial Technology (Architectural Drafting)",
        "Bachelor of Industrial Technology (Automotive)",
        "Bachelor of Industrial Technology (Electrical)",
        "Bachelor of Industrial Technology (Electronics)",
        "Bachelor of Industrial Technology (Apparel & Fashion)",
        "Bachelor of Industrial Technology (Culinary)",
        "Bachelor of Industrial Technology (Mechanical)",
        "Bachelor of Industrial Technology (HVACR)",
      ],
      "Advanced Education Programs (Graduate Studies)": [
        "Master in Public Administration",
        "Master of Arts in Education",
        "Master in Technology Management",
        "Doctor in Public Administration",
        "Doctor of Education",
        "PhD in Technology Management",
      ],
    },
    administrativeDepartments: {
      "Records & Academic Support": [
        "Records Management Office (RMO)",
        "Office of the Registrar",
        "Library and Information Services",
        "Scholarship Office",
        "NSTP Office",
      ],
      "Student Services": [
        "Office for Student Affairs and Services (OSAS)",
        "Guidance Services Office",
        "Alumni Relations Office",
      ],
      "Administration & Finance": [
        "Office of the University President",
        "Human Resource Management Office (HRMO)",
        "Information and Communications Technology (ICT) Office",
        "Bids and Awards Committee (BAC) Office",
        "Business Affairs Office",
        "Extension and Community Services Office",
        "Gender and Development Office",
        "DRRM Office",
      ],
    },
  },

  alijis: {
    academicColleges: {
      "College of Computer Studies (CCS)": [
        "BS in Information Systems",
        "BS in Information Technology",
      ],
      "College of Engineering (COE)": [
        "BS in Computer Engineering",
        "BS in Electronics Engineering",
      ],
      "College of Education (COED)": [
        "Bachelor of Technical-Vocational Teacher Education (Electrical Technology)",
        "Bachelor of Technical-Vocational Teacher Education (Electronics Technology)",
      ],
      "College of Industrial Technology (CIT)": [
        "Bachelor of Industrial Technology (Architectural Drafting)",
        "Bachelor of Industrial Technology (Automotive)",
        "Bachelor of Industrial Technology (Computer Technology)",
        "Bachelor of Industrial Technology (Electrical)",
        "Bachelor of Industrial Technology (Electronics)",
        "Bachelor of Industrial Technology (Culinary)",
        "Bachelor of Industrial Technology (Mechanical)",
      ],
    },
    administrativeDepartments: {
      "Campus Administration & Support": EXTERNAL_CAMPUS_ADMIN_OFFICES,
    },
  },

  binalbagan: {
    academicColleges: {
      "College of Business Management and Accountancy (CBMA)": [
        "BS in Business Administration major in Financial Management",
      ],
      "College of Computer Studies (CCS)": ["BS in Information Technology"],
      "College of Criminal Justice (CCJ)": ["BS in Criminology"],
      "College of Education (COED)": [
        "Bachelor of Elementary Education",
        "Bachelor of Secondary Education (Science)",
        "Bachelor of Technology and Livelihood Education (Home Economics)",
      ],
      "College of Fisheries (COF)": ["BS in Fisheries"],
    },
    administrativeDepartments: {
      "Campus Administration & Support": EXTERNAL_CAMPUS_ADMIN_OFFICES,
    },
  },

  "fortune-towne": {
    academicColleges: {
      "College of Business Management and Accountancy (CBMA)": [
        "BS in Accountancy",
        "BS in Business Administration major in Financial Management",
        "BS in Entrepreneurship",
        "BS in Management Accounting",
        "BS in Office Administration",
      ],
      "College of Computer Studies (CCS)": ["BS in Information Systems"],
    },
    administrativeDepartments: {
      "Campus Administration & Support": EXTERNAL_CAMPUS_ADMIN_OFFICES,
    },
  },
};

/**
 * Returns the list of College / Department options for a given campus slug and role.
 * - Students see only Academic Colleges offered on that campus.
 * - Non-students see both Academic Colleges and Administrative/Support Departments.
 */
export function getDepartmentsForCampusAndRole(campusSlug, role) {
  const entry = CHMSU_CAMPUS_DIRECTORY[campusSlug];
  if (!entry) return [];

  const academic = Object.keys(entry.academicColleges);
  if (role === "student") {
    return academic;
  }
  return [...academic, ...Object.keys(entry.administrativeDepartments)];
}

/**
 * Returns the cascading Program (for students) or Office (for non-students) options
 * for a given campus slug, role, and selected College / Department.
 */
export function getSubOptionsForSelection(campusSlug, role, department) {
  const entry = CHMSU_CAMPUS_DIRECTORY[campusSlug];
  if (!entry || !department) return [];

  if (role === "student") {
    return entry.academicColleges[department] ?? [];
  }

  if (entry.academicColleges[department]) {
    return ACADEMIC_COLLEGE_OFFICES;
  }

  return entry.administrativeDepartments[department] ?? [];
}

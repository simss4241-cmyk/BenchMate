// Curated recorded map + explicitly illustrative inventory; no live database or API.
export const SAMPLE = {
  "board": {
    "name": "ECU board",
    "model": "muse-spark-1.3",
    "components": [
      {
        "number": 1,
        "name": "left edge harness connector",
        "category": "Connectors",
        "markings": "37820-P75-901 832-100287 1106",
        "purpose": "Large black multi-pin edge connector along left side, likely main harness connector.",
        "evidence": "Long black plastic housing with many pins visible along left edge.",
        "unknown": "Pin count and mating type not readable in this view.",
        "confidence": "high",
        "bounds": {
          "x": 0,
          "y": 0.02,
          "width": 0.15,
          "height": 0.94
        }
      },
      {
        "number": 2,
        "name": "barcode label",
        "category": "Other useful parts",
        "markings": "37820-P75-901 832-100287 1106",
        "purpose": "White barcode inventory label on connector housing.",
        "evidence": "White label with barcode and numbers on black connector.",
        "unknown": "Does not identify electrical function.",
        "confidence": "high",
        "bounds": {
          "x": 0.003,
          "y": 0.025,
          "width": 0.095,
          "height": 0.315
        }
      },
      {
        "number": 3,
        "name": "top edge connector",
        "category": "Connectors",
        "markings": "",
        "purpose": "Candidate small black connector header near top silkscreen.",
        "evidence": "Rectangular black plastic outline at top edge.",
        "unknown": "Pin count and function unknown; partially shadowed.",
        "confidence": "medium",
        "bounds": {
          "x": 0.28,
          "y": 0.02,
          "width": 0.18,
          "height": 0.04
        }
      },
      {
        "number": 4,
        "name": "upper right IC",
        "category": "Other chips",
        "markings": "[unclear]",
        "purpose": "Candidate square QFP/SOP IC, likely logic or driver.",
        "evidence": "Black square package with perimeter pins upper right.",
        "unknown": "Part number not readable; need close-up.",
        "confidence": "medium",
        "bounds": {
          "x": 0.702,
          "y": 0.205,
          "width": 0.13,
          "height": 0.135
        }
      },
      {
        "number": 5,
        "name": "middle IC",
        "category": "Other chips",
        "markings": "[unclear]",
        "purpose": "Candidate square IC mid-board, likely logic/memory.",
        "evidence": "Black square package with gull-wing pins.",
        "unknown": "Markings not legible in this photo.",
        "confidence": "medium",
        "bounds": {
          "x": 0.653,
          "y": 0.379,
          "width": 0.115,
          "height": 0.135
        }
      },
      {
        "number": 6,
        "name": "large lower IC",
        "category": "Other chips",
        "markings": "27D [unclear]",
        "purpose": "Large square IC, possible microcontroller/ASIC.",
        "evidence": "Largest black IC lower-middle with visible pin rows.",
        "unknown": "Full part number not readable; function not verified.",
        "confidence": "medium",
        "bounds": {
          "x": 0.61,
          "y": 0.567,
          "width": 0.174,
          "height": 0.213
        }
      },
      {
        "number": 7,
        "name": "right side IC",
        "category": "Other chips",
        "markings": "[unclear]",
        "purpose": "Candidate square IC on right side.",
        "evidence": "Black square package with perimeter pads.",
        "unknown": "Markings not legible.",
        "confidence": "medium",
        "bounds": {
          "x": 0.832,
          "y": 0.491,
          "width": 0.129,
          "height": 0.166
        }
      },
      {
        "number": 8,
        "name": "lower right SOIC 1",
        "category": "Other chips",
        "markings": "[unclear]",
        "purpose": "Candidate small SOIC IC.",
        "evidence": "Small black rectangular package with two-row pins.",
        "unknown": "Value and function unknown.",
        "confidence": "medium",
        "bounds": {
          "x": 0.811,
          "y": 0.687,
          "width": 0.129,
          "height": 0.053
        }
      },
      {
        "number": 9,
        "name": "lower right SOIC 2",
        "category": "Other chips",
        "markings": "[unclear]",
        "purpose": "Candidate small SOIC IC.",
        "evidence": "Small black rectangular package above silkscreen box.",
        "unknown": "Markings not readable.",
        "confidence": "medium",
        "bounds": {
          "x": 0.834,
          "y": 0.75,
          "width": 0.129,
          "height": 0.053
        }
      },
      {
        "number": 10,
        "name": "bottom middle IC",
        "category": "Other chips",
        "markings": "[unclear]",
        "purpose": "Candidate small SOIC IC bottom middle.",
        "evidence": "Dark rectangular package with pins near bottom edge.",
        "unknown": "Heavily shadowed; need close-up.",
        "confidence": "low",
        "bounds": {
          "x": 0.527,
          "y": 0.885,
          "width": 0.1,
          "height": 0.042
        }
      },
      {
        "number": 11,
        "name": "mid-left small IC",
        "category": "Other chips",
        "markings": "[unclear]",
        "purpose": "Candidate small SOIC IC left-middle.",
        "evidence": "Small black 8-pin style package.",
        "unknown": "Part number not visible.",
        "confidence": "low",
        "bounds": {
          "x": 0.478,
          "y": 0.574,
          "width": 0.04,
          "height": 0.058
        }
      },
      {
        "number": 12,
        "name": "electrolytic capacitor 1",
        "category": "Capacitors",
        "markings": "[unclear]",
        "purpose": "Candidate aluminum electrolytic capacitor.",
        "evidence": "Silver-top cylindrical can with black sleeve left side.",
        "unknown": "Capacitance/voltage not readable.",
        "confidence": "high",
        "bounds": {
          "x": 0.195,
          "y": 0.336,
          "width": 0.055,
          "height": 0.08
        }
      },
      {
        "number": 13,
        "name": "electrolytic capacitor 2",
        "category": "Capacitors",
        "markings": "[unclear]",
        "purpose": "Candidate aluminum electrolytic capacitor.",
        "evidence": "Silver-top cylindrical can adjacent to previous cap.",
        "unknown": "Value not readable.",
        "confidence": "high",
        "bounds": {
          "x": 0.25,
          "y": 0.38,
          "width": 0.065,
          "height": 0.09
        }
      },
      {
        "number": 14,
        "name": "small electrolytic capacitor",
        "category": "Capacitors",
        "markings": "[unclear]",
        "purpose": "Candidate small electrolytic capacitor mid-board.",
        "evidence": "Small cylindrical can with light top.",
        "unknown": "Value unknown.",
        "confidence": "medium",
        "bounds": {
          "x": 0.322,
          "y": 0.455,
          "width": 0.04,
          "height": 0.057
        }
      },
      {
        "number": 15,
        "name": "silver can oscillator",
        "category": "Timing parts",
        "markings": "",
        "purpose": "Candidate metal-can crystal/resonator.",
        "evidence": "Silver oval metal canister vertical near right ICs.",
        "unknown": "Frequency not readable; need close-up.",
        "confidence": "medium",
        "bounds": {
          "x": 0.765,
          "y": 0.513,
          "width": 0.032,
          "height": 0.101
        }
      },
      {
        "number": 16,
        "name": "blue capacitor bottom",
        "category": "Capacitors",
        "markings": "",
        "purpose": "Candidate blue dipped capacitor bottom row.",
        "evidence": "One blue radial component in row of similar parts above silkscreen box.",
        "unknown": "Value not readable; individual value needs close-up.",
        "confidence": "medium",
        "bounds": {
          "x": 0.625,
          "y": 0.833,
          "width": 0.04,
          "height": 0.04
        }
      },
      {
        "number": 17,
        "name": "red dipped component",
        "category": "Capacitors",
        "markings": "",
        "purpose": "Candidate red dipped component, possibly capacitor or resistor network.",
        "evidence": "Red rectangular body mid-left.",
        "unknown": "Type and value unknown; need close-up.",
        "confidence": "low",
        "bounds": {
          "x": 0.35,
          "y": 0.532,
          "width": 0.06,
          "height": 0.03
        }
      },
      {
        "number": 18,
        "name": "unpopulated footprint top right",
        "category": "Other useful parts",
        "markings": "",
        "purpose": "Empty white silkscreen outline area, unpopulated connector/footprint.",
        "evidence": "White rectangular outline with pads top right.",
        "unknown": "Intended part unknown.",
        "confidence": "medium",
        "bounds": {
          "x": 0.793,
          "y": 0.06,
          "width": 0.145,
          "height": 0.12
        }
      }
    ]
  },
  "parts": [
    {
      "id": "motor",
      "name": "Small DC can motors",
      "kind": "part",
      "total": 3,
      "condition": "Untested",
      "identity": "Photo candidate",
      "location": "Sample tray A",
      "purpose": "Candidate drive motors; ratings and load suitability need checking.",
      "image": "assets/motors.jpg"
    },
    {
      "id": "buzzer",
      "name": "Piezo buzzer",
      "kind": "part",
      "total": 1,
      "condition": "Untested",
      "identity": "Sample record",
      "location": "Sample tray B",
      "purpose": "A possible voice for Juno. Voltage and drive requirements are not verified."
    },
    {
      "id": "donor",
      "name": "DVD / CD donor drive",
      "kind": "donor",
      "total": 1,
      "condition": "Not working \u00b7 sample",
      "identity": "Donor device",
      "location": "Donor shelf",
      "purpose": "Potential motors and switches remain on this donor. They are not loose stock."
    },
    {
      "id": "iron",
      "name": "Soldering iron",
      "kind": "tool",
      "total": 1,
      "condition": "User-reported working \u00b7 sample",
      "identity": "Reusable tool",
      "location": "Workbench",
      "purpose": "Bench equipment stays available as a tool; it is not a component to install."
    }
  ]
};

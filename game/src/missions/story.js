// The story of Halcyon Heat. Marisol "Sol" Vega, a getaway driver, comes home to Halcyon Bay to
// find her uncle Teo's body shop squeezed by Kane Okafor's Tidebreakers and Detective Ruiz
// circling everyone. Six missions, their givers, dialogue, objectives, timers and rewards.
export const CHARACTERS = {
  sol: { id: 'sol', name: 'Sol', colors: { skin: '#c68642', shirt: '#1f9aa8', pants: '#263a5e', hair: '#1b1b1b' } },
  teo: { id: 'teo', name: 'Uncle Teo', colors: { skin: '#a56f43', shirt: '#4a6b8a', pants: '#3b3b44', hair: '#e8e4dc' } },
  dani: { id: 'dani', name: 'Dani', colors: { skin: '#e0ac7e', shirt: '#ff6fb5', pants: '#1b1b1b', hair: '#d9b36a' } },
  ruiz: { id: 'ruiz', name: 'Det. Ruiz', colors: { skin: '#d9a77c', shirt: '#8f8c86', pants: '#2b2b30', hair: '#3b2416' } },
  kane: { id: 'kane', name: 'Kane Okafor', colors: { skin: '#5c3a1e', shirt: '#ffd23f', pants: '#1b1b1b', hair: '#1b1b1b' } },
  radio: { id: 'radio', name: 'Dispatch' },
};

/**
 * Stages: goto (reach a place or point), say (dialogue), getcar (spawn and take a car), deliver
 * (bring the tagged car somewhere, intact), kill (a squad must fall), wanted (set stars), escape
 * (lose the police), chase (stop a fleeing car), wait (seconds). A stage may carry a timer.
 */
export const MISSIONS = [
  {
    id: 'welcome', title: 'Welcome Home', giver: 'motel', giverLabel: 'Seabreeze Motel', reward: 500, rep: 60,
    intro: [
      { who: 'teo', text: 'Sol! Three years and not one postcard. Get over to the shop, I have work and worse news.' },
      { who: 'sol', text: 'Still on the docks, Teo? Give me ten minutes.' },
    ],
    stages: [
      { type: 'goto', place: 'garage', text: "Head to Teo's Body Shop at Saltmarsh Docks" },
      { type: 'say', lines: [
        { who: 'teo', text: "Kane Okafor's crew wants the shop for their chop work. I said no. Now my suppliers get nervous." },
        { who: 'teo', text: 'Take the Mule, run these parts to the marina before the boat leaves. Show me you still have it.' },
      ] },
      { type: 'getcar', spawn: { model: 'pickup', place: 'garage', offset: [14, 7], color: '#2fa36b', tag: 'mule' }, text: "Get in Teo's Mule pickup" },
      { type: 'deliver', place: 'marina', vehicle: 'mule', timer: 150, text: 'Deliver the parts to Halcyon Marina before the boat leaves' },
      { type: 'say', lines: [
        { who: 'sol', text: 'Parts delivered. Tell your boat people they owe me a beer.' },
        { who: 'teo', text: 'Not bad for a girl who has been away. Come back when you want real money.' },
      ] },
    ],
  },
  {
    id: 'hotwheels', title: 'Hot Wheels', giver: 'garage', giverLabel: "Teo's Body Shop", reward: 1200, rep: 90,
    intro: [
      { who: 'teo', text: "A Marlin GT is sitting outside a villa in Palmetto Heights. Its owner skipped on me. Bring it home." },
      { who: 'sol', text: "In daylight? He'll call it in before I hit the bridge." },
      { who: 'teo', text: "Then drive like you used to. Two and a half minutes, and don't scratch it." },
    ],
    stages: [
      { type: 'getcar', spawn: { model: 'coupe', place: 'villa', offset: [0, -4], color: '#e3342f', tag: 'marlin' }, text: 'Steal the red Marlin GT at the Palmetto Villa', marker: true, wantedOnTake: 2 },
      { type: 'say', lines: [{ who: 'radio', text: 'All units: red Marlin GT taken from Palmetto Heights, suspect heading north.' }] },
      { type: 'deliver', place: 'garage', vehicle: 'marlin', timer: 150, minHealth: 25, text: "Get the Marlin to Teo's garage in one piece" },
      { type: 'say', lines: [
        { who: 'teo', text: 'Look at that paint. Pearl Auto owes me a favour, we will give it a new face.' },
        { who: 'sol', text: 'Who was the owner, Teo?' },
        { who: 'teo', text: "One of Kane's lieutenants. Which is why you should meet Dani. Club Mirage, Neon Row." },
      ] },
    ],
  },
  {
    id: 'neonrun', title: 'Neon Run', giver: 'club', giverLabel: 'Club Mirage', reward: 1800, rep: 130,
    intro: [
      { who: 'dani', text: "Teo's niece. The getaway driver. I run the door here, and Kane's boys have been circling all week." },
      { who: 'sol', text: 'Then let them come. What do you need?' },
      { who: 'dani', text: 'A ride out of here, after you deal with whoever is waiting outside.' },
    ],
    stages: [
      { type: 'kill', place: 'club', offset: [-14, 10], count: 5, weapon: 'pistol', tag: 'ambush', text: "Take out Kane's crew outside Club Mirage", say: [{ who: 'dani', text: "They're Kane's boys, don't let them flank us!" }] },
      { type: 'say', lines: [{ who: 'dani', text: 'Clear. Grab a car, we need to be gone before the next wave.' }] },
      { type: 'getcar', text: 'Get a car for Dani' },
      { type: 'deliver', place: 'motel', text: 'Drive Dani to the Seabreeze Motel', timer: 120 },
      { type: 'say', lines: [
        { who: 'dani', text: 'Kane keeps his ledger in a case at the container yard. Ruiz would pay anything for it.' },
        { who: 'sol', text: 'Detective Ruiz. Teo says she is the only honest badge in the bay.' },
      ] },
    ],
  },
  {
    id: 'pier', title: 'Pier Pressure', giver: 'garage', giverLabel: "Teo's Body Shop", reward: 2600, rep: 180,
    intro: [
      { who: 'teo', text: "Dani told me about the ledger. Kane's yard is a fortress, Sol. Go in loud or don't go in." },
      { who: 'sol', text: 'Loud it is. Then I take it to Ruiz at the plaza.' },
    ],
    stages: [
      { type: 'goto', place: 'kaneYard', text: "Go to Kane's container yard at Saltmarsh Docks" },
      { type: 'kill', place: 'kaneYard', offset: [0, -16], count: 7, weapon: 'pistol', tag: 'yard', text: 'Clear the container yard', say: [{ who: 'sol', text: 'Tidebreakers. Everywhere. Fine.' }] },
      { type: 'goto', place: 'kaneYard', offset: [8, -26], radius: 3, text: "Grab Kane's ledger from the office", wantedOnArrive: 2 },
      { type: 'say', lines: [{ who: 'radio', text: 'Shots fired at Okafor Freight. Units respond, suspect on foot or in a vehicle.' }] },
      { type: 'goto', place: 'plaza', text: 'Bring the ledger to Detective Ruiz at Glasswater Plaza', timer: 240 },
      { type: 'say', lines: [
        { who: 'ruiz', text: "Kane's whole operation in one case. I could arrest you for how you got it." },
        { who: 'sol', text: 'But you will not, because you want what is in it.' },
        { who: 'ruiz', text: 'The ledger names a vault at Glasswater Bank. His money. Interested?' },
      ] },
    ],
  },
  {
    id: 'glasswater', title: 'The Glasswater Job', giver: 'garage', giverLabel: "Teo's Body Shop", reward: 6500, rep: 260,
    intro: [
      { who: 'teo', text: "Ruiz's plan is insane: hit Kane's vault at Glasswater Bank, make the city think it was him." },
      { who: 'sol', text: "The alarm will bring every cruiser in the bay. I'll need the Marlin ready and a clean run back here." },
      { who: 'teo', text: 'The Marlin is fuelled. Lose them, then come home. Not before.' },
    ],
    stages: [
      { type: 'getcar', spawn: { model: 'coupe', place: 'garage', offset: [14, 7], color: '#ffd23f', tag: 'getaway' }, text: 'Take the Marlin GT' },
      { type: 'goto', place: 'bank', text: 'Drive to Glasswater Bank', vehicleTag: 'getaway' },
      { type: 'wait', seconds: 6, text: 'Crack the vault...', say: [{ who: 'sol', text: 'Vault open. And that is the alarm. Here we go.' }] },
      { type: 'wanted', stars: 4 },
      { type: 'escape', text: "Lose the cops before reaching Teo's garage", requireVehicleTag: 'getaway' },
      { type: 'deliver', place: 'garage', vehicle: 'getaway', text: "Bring the money back to Teo's garage" },
      { type: 'say', lines: [
        { who: 'teo', text: "Every cruiser in Halcyon Bay and you still came back with the paint on. Your mother would be proud." },
        { who: 'ruiz', text: "Kane knows it was you. He's running for the marina tonight. This ends on the pier, Sol." },
      ] },
    ],
  },
  {
    id: 'bloodtide', title: 'Blood Tide', giver: 'garage', giverLabel: "Teo's Body Shop", reward: 12000, rep: 400,
    intro: [
      { who: 'ruiz', text: "Kane's convoy is leaving the marina, heading down Ocean Drive. Stop his car before he reaches the pier." },
      { who: 'sol', text: 'And if he makes it to the pier?' },
      { who: 'ruiz', text: 'Then you finish it there. I will keep my people away for ten minutes. No longer.' },
    ],
    stages: [
      { type: 'getcar', text: 'Get a fast car' },
      { type: 'chase', spawn: { model: 'coupe', place: 'marina', offset: [-8, 20], color: '#1b1b1b', tag: 'kane' }, text: "Chase down Kane's black Marlin on Ocean Drive", say: [{ who: 'kane', text: 'The driver. Teo should have sold when I asked nicely.' }] },
      { type: 'say', lines: [{ who: 'kane', text: 'You think this ends with a wreck? The pier, Vega. Come and get me.' }] },
      { type: 'goto', place: 'pier', text: 'Go to the end of Coral Pier', radius: 12 },
      { type: 'kill', place: 'pier', offset: [10, 0], count: 4, weapon: 'smg', tag: 'finale', boss: true, text: "Finish Kane and his guards at the lighthouse", say: [{ who: 'kane', text: 'Halcyon Bay was mine before you were born!' }] },
      { type: 'say', lines: [
        { who: 'sol', text: "It's over, Kane. The bay never belonged to you." },
        { who: 'ruiz', text: 'My people are two minutes out. You were never here, Sol. Go home.' },
        { who: 'teo', text: 'Come by the shop. The sign is getting a new name: Vega & Teo.' },
      ] },
    ],
  },
];

export const STORY_COMPLETE = [
  { who: 'sol', text: 'Halcyon Bay. Sun on the water, the cops two minutes behind. Feels like home.' },
];

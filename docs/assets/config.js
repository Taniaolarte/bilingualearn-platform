/* Platform settings.
   apiUrl: the Google Apps Script web app URL (README → "Connect Google Drive").
   While it is empty, practice works but nothing is sent to the coach. */
window.BL_CONFIG = {
  apiUrl: "https://script.google.com/macros/s/AKfycbzrA3m5p5McgGM97tukzMfNsPVJjSvY-dqLOuBm37a8E6pUISi57apkMe38be4O5FnyLg/exec",
  course: "CELPIP",
  /* Access keys: nobody sees the platform until they type one of these.
     Only SHA-256 hashes live here (this repo is public); the keys themselves are in claves-acceso.txt, which is not uploaded.
     Deleting a line blocks that key, even on devices that already entered it. */
  accessKeys: [
    "4789052762ae7de9bf4657cd7f0d6c12cd094b6f1804406a14b8fb83674aed38", // 1
    "dcc347eab2f0a57d3c12c17f362167f482eafe1510a810304c170f636aa01131", // 2
    "fc9f7b69cdd744653e892be67be21adf2be6b1dbdf4213a849abd6e9aaac0130", // 3
    "06b7e148e9254589e3c9155067668db36baac0fc3a893b5d0fd616d6a8d14a65", // 4
    "0e4d7ee4cb103250c84e388119ac353228c51cfc847140e299c4f8786907720a", // 5
    "32fa824297ad94b3b3d9631d4889065956f5f75b10503a0d79dcc2e4514ac7a5", // 6
    "f89ea49a5aa6770114ec27041502f2d755952b030ecf747f9969dd0027b4365e", // 7
    "30ec0760e21615b17e5a70b02e577c70f07c6774dabc5587a45da2739f61ee57", // 8
    "fa41e683040e355bf7a15e187eb7bf11d0a8230833066ff3cea73180217e5f6c", // 9
    "db89937493e0fc7139c4297cc233ee0f7cca69d72105590535d1bc1d726e36b1", // 10
  ],
};

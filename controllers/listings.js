const Listing = require("../models/listing");
const review = require("../models/review");
const { isLoggedIn, isOwner, validateListing } = require("../middleware.js");
const mbxGeocoding = require("@mapbox/mapbox-sdk/services/geocoding");
const mapToken = process.env.MAP_TOKEN;
const geocodingClient = mbxGeocoding({ accessToken: mapToken });

/* ------------------------ INDEX ------------------------ */
module.exports.index = async (req, res) => {
  const allListing = await Listing.find({});
  res.render("./listings/index.ejs", { allListing });
};

/* -------------------- RENDER NEW FORM ------------------ */
module.exports.renderNewForm = (req, res) => {
  res.render("./listings/new.ejs");
};

/* --------------------- SHOW LISTING -------------------- */
module.exports.showListing = async (req, res) => {
  let { id } = req.params;
  const listing = await Listing.findById(id)
    .populate({
      path: "reviews",
      populate: {
        path: "author",
        select: "username",
      },
    })
    .populate("owner");

  if (!listing) {
    req.flash("error", "Cannot find that listing!");
    return res.redirect("/listings");
  }
  res.render("./listings/show.ejs", { listing });
};

/* -------------------- CREATE LISTING ------------------- */
module.exports.createListing = async (req, res) => {
  let response = await geocodingClient
    .forwardGeocode({
      query: req.body.listing.location,
      limit: 1,
    })
    .send();

  let url = req.file.path;
  let filename = req.file.filename;

  const newListing = new Listing(req.body.listing);
  newListing.owner = req.user._id;
  newListing.image = { url, filename };
  newListing.geometry = response.body.features[0].geometry;

  // 🟢 Auction fields handle karo
  if (req.body.listing.isAuction === "true") {
    newListing.isAuction = true;
    newListing.auctionStartTime = req.body.listing.startTime || null;
    newListing.auctionEndTime = req.body.listing.endTime || null;
  }

  let saveListing = await newListing.save();
  console.log("Created Listing:", saveListing);

  req.flash("success", "New Listing Created!");
  res.redirect("/listings");
};

/* -------------------- EDIT FORM ------------------------ */
module.exports.renderEditForm = async (req, res) => {
  let { id } = req.params;
  const listing = await Listing.findById(id);
  if (!listing) {
    req.flash("error", "Cannot find that listing!");
    return res.redirect("/listings");
  }

  let OriginalImageUrl = listing.image.url;
  OriginalImageUrl = listing.image.url
    .replace(/w=\d+/, "w=250")
    .replace(/h=\d+/, "h=100");
  console.log("Transformed URL:", OriginalImageUrl);
  res.render("./listings/edit.ejs", { listing, OriginalImageUrl });
};

/* -------------------- UPDATE LISTING ------------------- */
module.exports.updateListing = async (req, res) => {
  let { id } = req.params;
  let listing = await Listing.findByIdAndUpdate(id, { ...req.body.listing });

  if (typeof req.file !== "undefined") {
    let url = req.file.path;
    let filename = req.file.filename;
    listing.image = { url, filename };
    await listing.save();
  }

  // 🟢 Auction fields update
  listing.isAuction = req.body.listing.isAuction === "true";
  listing.auctionStartTime = req.body.listing.startTime || null;
  listing.auctionEndTime = req.body.listing.endTime || null;
  await listing.save();

  req.flash("success", "Listing updated!");
  res.redirect(`/listings/${id}`);
};

/* -------------------- DELETE LISTING ------------------- */
module.exports.deleteListing = async (req, res) => {
  let { id } = req.params;
  await Listing.findByIdAndDelete(id);
  req.flash("success", "Listing Deleted!");
  res.redirect("/listings");
};

/* ------------------- FILTER LISTINGS ------------------- */
module.exports.filterListings = async (req, res) => {
  const { category } = req.params;
  try {
    let filteredListings;
    if (category === "trending") {
      filteredListings = await Listing.find({})
        .sort({ reviews: -1 })
        .limit(10);
    } else {
      filteredListings = await Listing.find({ category });
    }
    res.render("listings/index", { allListing: filteredListings });
  } catch (error) {
    req.flash("error", "Error filtering listings");
    res.redirect("/listings");
  }
};

/* ----------------- GET LIVE AUCTIONS ------------------- */
module.exports.getLiveAuctions = async (req, res) => {
  const currentTime = new Date();
  const liveAuctions = await Listing.find({
    isAuction: true,
    auctionStartTime: { $lte: currentTime },
    auctionEndTime: { $gt: currentTime },
  });
  res.render("liveAuction", {
    auctions: liveAuctions,
    currentUser: req.user,
  });
};

/* ------------------ PLACE A BID ------------------------ */
module.exports.placeBid = async (req, res) => {
  const { id } = req.params;
  const { bidAmount } = req.body;
  const listing = await Listing.findById(id);

  if (!listing.isAuction) {
    req.flash("error", "This listing is not an auction.");
    return res.redirect("/live-auctions");
  }

  if (bidAmount <= listing.highestBid) {
    req.flash("error", "Bid must be higher than current highest bid!");
    return res.redirect("/live-auctions");
  }

  listing.highestBid = bidAmount;
  listing.highestBidder = req.user._id;
  await listing.save();

  req.flash("success", "Bid placed successfully!");
  res.redirect("/live-auctions");
};

const puppeteer = require("puppeteer");
const fs = require("fs");

const url = `https://jsapi.apiary.io/apis/swyftx.html`;

/**
 * @see https://stackoverflow.com/questions/52497252/puppeteer-wait-until-page-is-completely-loaded/52501934
 */
const waitTillHTMLRendered = async (page, timeout = 30000) => {
  const checkDurationMsecs = 1000;
  const maxChecks = timeout / checkDurationMsecs;
  let lastHTMLSize = 0;
  let checkCounts = 1;
  let countStableSizeIterations = 0;
  const minStableSizeIterations = 3;

  while (checkCounts++ <= maxChecks) {
    let html = await page.content();
    let currentHTMLSize = html.length;

    let bodyHTMLSize = await page.evaluate(
      () => document.body.innerHTML.length
    );

    console.log(
      "last: ",
      lastHTMLSize,
      " <> curr: ",
      currentHTMLSize,
      " body html size: ",
      bodyHTMLSize
    );

    if (lastHTMLSize != 0 && currentHTMLSize == lastHTMLSize)
      countStableSizeIterations++;
    else countStableSizeIterations = 0; //reset the counter

    if (countStableSizeIterations >= minStableSizeIterations) {
      console.log("Page rendered fully...");
      break;
    }

    lastHTMLSize = currentHTMLSize;
    await page.waitFor(checkDurationMsecs);
  }
};

const scrapedData = {
  endpoints: [],
};

const main = async () => {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [`--window-size=1920,1080`],
      defaultViewport: {
        width: 1920,
        height: 1080,
      },
    });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "load" });
    await waitTillHTMLRendered(page);

    const elHandleArray = await page.$$(".actionInvitation");

    let index = 0;
    for (const el of elHandleArray) {
      const tempEndpointObj = {};

      console.log("@ STARTING INDEX:", index);
      await el.click();
      await page.screenshot({ path: `imgs/debugging-${index}.png` });

      // Note: this is a hack to avoid issue where new nodes are constantly added to the DOM
      // while older ones only have the `.hidden` class added.
      const machineColumnContent = await page.waitForSelector(
        ".row.machineColumnContent:last-of-type"
      );
      const urlEl = await machineColumnContent.$(".uriTemplate");
      const value = await urlEl.evaluate((el) => el.textContent);

      console.log("@ PATH", value);
      tempEndpointObj.url = value;

      // Get Required Body values
      // const attributesArr = await machineColumnContent.$$(".row.attributesKit");

      // if (attributesArr && attributesArr.length) {
      //   for (const attribute of attributesArr) {
      //     const attributeKit = await attribute.$(".attributesKit");
      //     const attributeKitValue = await attributeKit.evaluate((el) =>
      //       el.textContent.trim()
      //     );

      //     const [name, isRequired, type, description] =
      //       attributeKitValue.split(" ");

      //     console.log("@ ATTR", name, isRequired, type, description);
      //   }
      // }

      // Get Parameters
      const paramsListArr = await machineColumnContent.$$(".parameterRow");
      const finalParameterArr = [];

      if (paramsListArr && paramsListArr.length) {
        for (const param of paramsListArr) {
          const paramKey = await param.$(".parameterKey");
          const paramKeyValue = await paramKey?.evaluate((el) =>
            el.textContent?.trim()
          );
          const paramRequirement = await param.$(".parameterRequirement");
          const paramRequirementValue = await paramRequirement?.evaluate((el) =>
            el.textContent?.trim()
          );
          const paramDescription = await param.$(".parameterDescription");
          const paramDescriptionValue = await paramDescription?.evaluate((el) =>
            el.textContent?.trim()
          );
          console.log(
            "@ PARAM",
            paramKeyValue,
            paramRequirementValue,
            paramDescriptionValue
          );

          finalParameterArr.push({
            paramKeyValue,
            paramRequirementValue,
            paramDescriptionValue,
          });
        }
      }

      tempEndpointObj.parameters = finalParameterArr;

      // Get Responses
      const responseListArr = await machineColumnContent.$$(
        ".machineColumnResponse"
      );
      const finalResponseArr = [];

      if (responseListArr && responseListArr.length) {
        for (const response of responseListArr) {
          const responseStatus = await response.$(".responseStatusCode");
          const responseStatusValue = await responseStatus?.evaluate((el) =>
            el.textContent?.trim()
          );
          const responseExample = await response.$(".rawExampleBody");
          const responseExampleValue = await responseExample?.evaluate((el) =>
            el.textContent?.trim()
          );

          console.log("@ RESPONSE", responseStatusValue, responseExampleValue);
          finalResponseArr.push({
            responseStatusValue,
            responseExampleValue: responseExampleValue
              ? JSON.parse(responseExampleValue)
              : null,
          });
        }
      }

      tempEndpointObj.responses = finalResponseArr;

      // push temp endpoint object to final object
      scrapedData.endpoints.push(tempEndpointObj);

      index++;
    }

    // write out the temp endpoint object to file
    fs.writeFileSync(
      "./data.json",
      JSON.stringify(scrapedData, null, 2),
      "utf-8"
    );
  } catch (err) {
    console.error(err);
  } finally {
    await browser.close();
  }
};

main();

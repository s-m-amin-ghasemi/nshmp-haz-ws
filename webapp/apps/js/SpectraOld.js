'use strict'

import D3LinePlot from './lib/D3LinePlot.js';
import Gmm from './lib/Gmm.js';
import NshmpError from './lib/NshmpError.js';
import Tools from './lib/Tools.js';

/** 
* @fileoverview Class for spectra-plot.html, response spectra web app.
* This class plots the results of nshmp-haz-ws/gmm/spectra web service.
* This class will first call out to nshmp-haz-ws/gmm/spectra web service
*     to obtain the usage and create the control panel with the following:
*     - Ground motions models
*     - Magnitude
*     - Rake
*     - zHyp
*     - Fault mech (strike-slip, normal, reverse)
*     - zTop
*     - Dip
*     - Width
*     - rX
*     - rRup
*     - rJB
*     - Vs30
*     - Vs30 measured or inferred
*     - Z1.0
*     - Z2.5
* Once the control panel is set, it can be used to select desired
*     parameters and plot ground motion vs. period. 
* Already defined DOM elements:
*   - #gmms
*   - .gmm-alpha
*   - .gmm-group
*   - #inputs
*   - #Mw
*   - #vs30
*   - #z1p0
*   - #z2p5
*                                                                               
* @class Spectra 
* @extends Gmm
* @author bclayton@usgs.gov (Brandon Clayton)
*/
export default class SpectraOld extends Gmm {

  /**
  * @param {HTMLElement} contentEl - Container element to put plots
  */
  constructor(config) {
    let webApp = 'Spectra';
    let wsUrl = '/nshmp-haz-ws/gmm/spectra';
    super(webApp, wsUrl, config);
    this.header.setTitle('Response Spectra');

    /** @type {HTMLElement} */ 
    this.contentEl = document.querySelector('#content'); 
    /** @type {HTMLElement} */                                                  
    this.dipEl = document.querySelector('#dip');                                
    /** @type {HTMLElement} */ 
    this.hwFwEl = document.querySelector('#hw-fw');
    /** @type {HTMLElement} */ 
    this.hwFwFwEl = document.querySelector('#hw-fw-fw');
    /** @type {HTMLElement} */ 
    this.hwFwHwEl = document.querySelector('#hw-fw-hw');
    /** @type {HTMLElement} */ 
    this.faultStyleEl = document.querySelector('#fault-style');
    /** @type {HTMLElement} */ 
    this.faultStyleNormalEl = document.querySelector('#fault-style-normal');
    /** @type {HTMLElement} */ 
    this.faultStyleReverseEl = document.querySelector('#fault-style-reverse');
    /** @type {HTMLElement} */ 
    this.faultStyleStrikeEl = document.querySelector('#fault-style-strike');
    /** @type {HTMLElement} */ 
    this.rakeEl = document.querySelector('#rake'); 
    /** @type {HTMLElement} */ 
    this.rCheckEl = document.querySelector('#r-check');
    /** @type {HTMLElement} */ 
    this.rJBEl = document.querySelector('#rJB');
    /** @type {HTMLElement} */ 
    this.rRupEl = document.querySelector('#rRup');
    /** @type {HTMLElement} */ 
    this.rXEl = document.querySelector('#rX');
    /** @type {HTMLElement} */                                                  
    this.widthEl = document.querySelector('#width');                            
    /** @type {HTMLElement} */ 
    this.zCheckEl = document.querySelector('#z-check');
    /** @type {HTMLElement} */ 
    this.zHypEl = document.querySelector('#zHyp');
    /** @type {HTMLElement} */                                                  
    this.zTopEl = document.querySelector('#zTop');
    
    this.addToggle(this.hwFwEl.id, this.updateDistance);
    this.addToggle(this.faultStyleEl.id, this.updateRake);
    
    $(this.rCheckEl).change((event) => {
      let rCompute = event.target.checked;
      $(this.rJBEL).prop('readonly', rCompute);
      $(this.rRupEl).prop('readonly', rCompute);
      $(this.hwFwHwEl).prop('disabled', !rCompute);
      $(this.hwFwFwEl).prop('disabled', !rCompute);
      this.updateDistance();
    });
    
    $(this.rakeEl).on('input', () => { this.updateFocalMech(); });

    $(this.rXEl).on('input', () => { this.updateDistance(); });
    
    $(this.dipEl).on('input', () => {
      this.updateDistance();
      this.updateHypoDepth();
    });
    
    $(this.widthEl).on('input', () => {
      this.updateDistance();
      this.updateHypoDepth();
    });
    
    $(this.zCheckEl).change((event) => {
      $(this.zHyp).prop('readonly', event.target.checked);
      this.updateHypoDepth();
    });
    
    $(this.zTopEl).on('input', () => {
      this.updateDistance();
      this.updateHypoDepth();
    });
    
    /** @type {D3LinePlot} */
    this.plot = this.plotSetup();
    
    /** X-axis domain - @type {Array<Number>} */
    this.spectraXDomain = [0.01, 10.0];

    this.getUsage();
	}
 
  /**
   * @return {Map<String, Array<String>>} The metadata Map
   */
  getMetadata() {
    let gmms = this.getCurrentGmms(); 

    let metadata = new Map();
    metadata.set('Ground Motion Model:', gmms);
    metadata.set('M<sub>W</sub>:', [this.MwEl.value]);
    metadata.set('Rake (°):', [this.rakeEl.value]);
    metadata.set('Z<sub>Top</sub> (km):', [this.zTopEl.value]);
    metadata.set('Dip (°):', [this.dipEl.value]);
    metadata.set('Width (km):', [this.widthEl.value]);
    metadata.set('R<sub>X</sub> (km):', [this.rXEl.value]);
    metadata.set('R<sub>Rup</sub> (km):', [this.rRupEl.value]);
    metadata.set('R<sub>JB</sub> (km):', [this.rJBEl.value]);
    metadata.set('V<sub>s</sub>30 (m/s):', [this.vs30El.value]);
    metadata.set('Z<sub>1.0</sub> (km):', [this.z1p0El.value]);
    metadata.set('Z<sub>2.5</sub> (km):', [this.z2p5El.value]);

    return metadata;
  }

  /**
  * @method plotGmm
  *
  * Plot ground motions Vs. period in the upper plot panel
  * @param {Object} response - JSON return from gmm/spectra web service
  */
  plotGmm(response) {
    let metadata = this.getMetadata();
    metadata.set('url', [window.location.href]);
    metadata.set('date', [response.date]);

    let mean = response.means;
    let meanData = mean.data;
    let seriesLabels = [];
    let seriesIds = [];
    let seriesData = [];
      
    meanData.forEach((d, i) => {
      d.data.xs[0] = 'PGA';
      seriesLabels.push(d.label);
      seriesIds.push(d.id);
      seriesData.push(d3.zip(d.data.xs, d.data.ys));
    });
    
    this.plot.setUpperData(seriesData)
        .setMetadata(metadata)
        .setUpperDataTableTitle('Means')
        .setUpperPlotFilename('spectraMean')
        .setUpperPlotIds(seriesIds)
        .setUpperPlotLabels(seriesLabels)
        .setUpperXLabel(mean.xLabel)
        .setUpperYLabel(mean.yLabel)
        .plotData(this.plot.upperPanel, this.spectraXDomain);
  }

  /**
  * @method plotSetup
  *
  * Set the plot options for the ground motion Vs. period and
  *   the accompanying sigma plot.
  * @return {D3LinePlot} New instance of D3LinePlot
  */
  plotSetup() {
    let plotOptions = {
      plotLowerPanel: true,
      syncSelections: true,
      syncXAxis: true,
      syncYAxis: false,
      xAxisScale: 'log',
    };

    let meanTooltipText = ['GMM:', 'Period (s):', 'MGM (g):'];
    let meanPlotOptions = {
      legendLocation: 'topright',
      printMetadataColumns: 4,
      tooltipText: meanTooltipText,
      yAxisScale: 'linear',
    };
    
    let sigmaTooltipText = ['GMM:', 'Period (s):', 'SD:'];
    let sigmaPlotOptions = {
      plotHeight: 224,
      plotWidth: 896,
      printMetadataColumns: 4,
      showLegend: false,
      tooltipText: sigmaTooltipText,
      yAxisScale: 'linear',
    };
    
    return new D3LinePlot(
        this.contentEl,
        plotOptions,
        meanPlotOptions,
        sigmaPlotOptions)
        .withPlotHeader()
        .withPlotFooter();
  }

  /**
  * @method plotSigma
  *
  * Plot sigma of ground motions in the lower plot panel
  * @param {Object} response - JSON return from gmm/spectra web service
  */
  plotSigma(response) {
    let sigma = response.sigmas;
    let sigmaData = sigma.data;

    let seriesLabels = [];
    let seriesIds = [];
    let seriesData = [];
      
    sigmaData.forEach((d, i) => {
      d.data.xs[0] = 'PGA';
      seriesLabels.push(d.label);
      seriesIds.push(d.id);
      seriesData.push(d3.zip(d.data.xs, d.data.ys));
    });
   
    this.plot.setLowerData(seriesData)
        .setLowerDataTableTitle('Sigmas')
        .setLowerPlotFilename('spectraSigma')
        .setLowerPlotIds(seriesIds)
        .setLowerPlotLabels(seriesLabels)
        .setLowerXLabel(sigma.xLabel)
        .setLowerYLabel(sigma.yLabel)
        .plotData(this.plot.lowerPanel, this.spectraXDomain);
  }
  
  /**
  * @method updatePlot
  *
  * Call the ground motion web service and plot the results
  */ 
  updatePlot() {
    let url = this.serializeGmmUrl(); 
    let jsonCall = Tools.getJSON(url);
    this.spinner.on(jsonCall.reject, 'Calculating');

    jsonCall.promise.then((response) => {
      this.spinner.off();
      NshmpError.checkResponse(response, this.plot);

      this.footer.setMetadata(response.server);
      this.plot.setPlotTitle('Response Spectra');
      // Plot means
      this.plotGmm(response);
      // Plot sigmas
      this.plotSigma(response); 
      // Sync selections
      this.plot.syncSelections();

      $(this.footer.rawBtnEl).off(); 
      $(this.footer.rawBtnEl).click((event) =>{
        window.open(url);
      });
    }).catch((errorMessage) => {
      this.spinner.off();
      NshmpError.throwError(errorMessage);
    });
  }

}
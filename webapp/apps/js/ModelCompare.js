




/**
* @class ModelCompare
*
* @classdec Class for model-compare.html
*
*/
class ModelCompare extends Hazard{

  //.......................... Constructor: ModelCompare .......................
  constructor(config){

    //......................... Variables ......................................
    let _this = super(config); 
    
    _this.header.setTitle("Model Comparison");
    _this.spinner.on();
    //--------------------------------------------------------------------------
  
    _this.options = {
        type: "compare",
        regionDefault: "COUS",
        imtDefault: "PGA",
        vs30Default: 760,
    };

    //..................... Plot Setup .........................................
    _this.plotEl = document.querySelector("#content");
    let plotOptions = {
      colSizeMin: "col-md-offset-3 col-md-6",
    };

    let tooltipText = ["Edition", "GM (g)", "AFE"];
    let hazardCurveOptions = {
      legendLocation: "bottomleft",
      tooltipText: tooltipText
    };


    _this.plot = new D3LinePlot(_this.plotEl,
        plotOptions,
        hazardCurveOptions,
        {}); 
    //--------------------------------------------------------------------------


    //........................ Comparable Regions ..............................
    _this.comparableRegions = [
      {
        display: "Alaska",
        value: "AK",
        staticValue: "AK0P10",
        dynamicValue: "AK"
      },{
        display: "Central & Eastern US",
        value:"CEUS",
        staticValue: "CEUS0P10",
        dynamicValue: "CEUS"
      },{
        display: "Conterminous US",
        value: "COUS",
        staticValue: "COUS0P05",
        dynamicValue: "COUS"
      },{
        display: "Western US",
        value: "WUS",
        staticValue: "WUS0P05",
        dynamicValue: "WUS"
      }
    ];
    //--------------------------------------------------------------------------


    //....................... Get Hazard Parameters ............................
    ModelCompare.getHazardParameters(_this,setParameters); 
    function setParameters(par){
      _this.spinner.off();
      _this.parameters = par;
      ModelCompare.buildInputs(_this); 
    };
    //--------------------------------------------------------------------------
   

    $(_this.footer.updateBtnEl).click(function(){
      Hazard.callHazard(_this,ModelCompare.callHazardCallback);
    });
                                                                                
    //............. Call Hazard Code on Enter ..................................
    $(_this.controlEl).keypress(function(key){
      var keyCode = key.which || key.keyCode;
      if (keyCode == 13){
        Hazard.callHazard(_this,ModelCompare.callHazardCallback);
      }
    });
    //--------------------------------------------------------------------------

  
    
  
  }
  //---------------------- End Constructor: ModelComapre -----------------------


  //......................... Method: buildInputs ..............................
  static buildInputs(_this){
     
    ModelCompare.checkQuery(_this);
    
    ModelCompare.setParameterMenu(_this,"region",_this.comparableRegions);
    ModelCompare.setBounds(_this);
    
    let supportedEditions = ModelCompare.supportedEditions(_this);
    ModelCompare.setParameterMenu(_this,"edition",supportedEditions);
    d3.select(_this.editionEl)  
        .selectAll("option")
        .attr("selected",true);
    
    let supportedImt = ModelCompare.supportedValues(_this,"imt");
    let supportedVs30 = ModelCompare.supportedValues(_this,"vs30");
    ModelCompare.setParameterMenu(_this,"imt",supportedImt);
    ModelCompare.setParameterMenu(_this,"vs30",supportedVs30);
    
    $(_this.regionEl).change(function(){
      ModelCompare.clearCoordinates(_this);
      ModelCompare.setBounds(_this);
      supportedEditions = ModelCompare.supportedEditions(_this);
      ModelCompare.setParameterMenu(_this,"edition",supportedEditions);
      d3.select(_this.editionEl)  
          .selectAll("option")
          .attr("selected",true);
      
      supportedImt = ModelCompare.supportedValues(_this,"imt");
      supportedVs30 = ModelCompare.supportedValues(_this,"vs30");
      ModelCompare.setParameterMenu(_this,"imt",supportedImt);
      ModelCompare.setParameterMenu(_this,"vs30",supportedVs30);
    });
    
    $(_this.editionEl).change(function(){
      supportedImt = ModelCompare.supportedValues(_this,"imt");
      supportedVs30 = ModelCompare.supportedValues(_this,"vs30");
      ModelCompare.setParameterMenu(_this,"imt",supportedImt);
      ModelCompare.setParameterMenu(_this,"vs30",supportedVs30);
     });
    
    let canSubmit = ModelCompare.checkQuery(_this);
    if (canSubmit) ModelCompare.callHazard(_this,ModelCompare.callHazardCallback);
  }                                                                             
  //------------------- End Method: buildInputs --------------------------------



  static supportedEditions(_this){
    var selectedRegion = _this.comparableRegions.find(function(region,i){
      return region.value == _this.regionEl.value;
    }); 
    var supportedEditions = _this.parameters.edition
        .values.filter(function(editionValue,iev){
          return editionValue.supports.region.find(function(regionValue,irv){
            return regionValue == selectedRegion.staticValue || 
                regionValue == selectedRegion.dynamicValue;
          })
    });
    
    return supportedEditions;
  }

  
  
  //.......................... Plot Hazard Curves ..............................
  static plotHazardCurves(_this,jsonResponse){
    _this.spinner.off();
    
    var selectedImtDisplay = _this.imtEl.querySelector(":checked").text; 
    var selectedImtValue   = _this.imtEl.value; 
    let title = "Hazard Curves at " + selectedImtDisplay; 
    let filename = "hazardCurves-"+selectedImtValue;

    var seriesData = [];       
    var seriesLabels = [];       
    var seriesLabelIds = [];       

    //............... Get Data from Selected IMT Value and Format for D3 .......
    for (var jr in jsonResponse){        
      var dataType = jsonResponse[jr].dataType;
      var response  = jsonResponse[jr].find(function(d,i){
       return d.metadata.imt.value == selectedImtValue;
      });
      var data = response.data;
      
      //................ JSON Variables based on Edition Type ..................
      if (dataType == "dynamic"){
        var xValueVariable = "xvalues";
        var yValueVariable = "yvalues";
        var jtotal = data.findIndex(function(d,i){ 
          return d.component == "Total"
        });     
      }else if (dataType == "static"){ 
        var xValueVariable = "xvals";
        var yValueVariable = "yvals";
        var jtotal          = 0; 
      } 
      //------------------------------------------------------------------------
    
      //...................... Set Data for D3 .................................
      var xValues = response.metadata[xValueVariable];
      seriesData[jr] = d3.zip(xValues,data[jtotal][yValueVariable]);
      seriesLabels[jr] = response.metadata.edition.display; 
      seriesLabelIds[jr] = response.metadata.edition.value;
      //------------------------------------------------------------------------
    }
    //--------------------------------------------------------------------------
   
    //.................. Get Axis Information ..................................
    var metadata = jsonResponse[0][0].metadata;
    var xLabel   = metadata.xlabel;
    var yLabel   = metadata.ylabel;
    metadata = {
        version: "1.1",
        url: window.location.href,
        time: new Date()
      };
    //--------------------------------------------------------------------------
    

    //.................... Plot Info Object for D3 .............................
    _this.plot.title = title;
    
    _this.plot.upperPanel.data = seriesData;
    _this.plot.upperPanel.ids = seriesLabelIds;
    _this.plot.upperPanel.labels = seriesLabels;
    _this.plot.upperPanel.metadata = metadata;
    _this.plot.upperPanel.plotFilename = filename;
    _this.plot.upperPanel.xLabel = xLabel;
    _this.plot.upperPanel.yLabel = yLabel;
   
    _this.plot.removeSmallValues(_this.plot.upperPanel, 1e-14); 
    _this.plot.plotData(_this.plot.upperPanel);
    //--------------------------------------------------------------------------

  }


  static callHazardCallback(_this,hazardReturn){

    ModelCompare.plotHazardCurves(_this,hazardReturn);
    $(_this.imtEl).off(); 
    $(_this.imtEl).change(function(){
      ModelCompare.plotHazardCurves(_this,hazardReturn);
    });
  
  }


}
//-------------------- End Class: ModelCompare ---------------------------------